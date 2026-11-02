import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type { Construct } from 'constructs';

export interface EdgeStackProps extends StackProps {
  /**
   * Deploy this stack in us-east-1: CloudFront WAF web ACLs and certificates must live there.
   * Set `crossRegionReferences: true` when the cell stacks are in another region.
   */
  readonly baseDomain: string;
  readonly hostedZoneId: string;
  /** ARN of an ACM certificate in us-east-1 covering `<baseDomain>` and `*.<baseDomain>`. */
  readonly cloudFrontCertificateArn: string;
  readonly webBucketName: string;
  readonly webBucketRegion: string;
  /** Domain of the ALB origin, for example `alb.<baseDomain>`. */
  readonly albDomainName: string;
  /** Requests per 5 minutes per IP before blocking. */
  readonly rateLimitPerIp?: number;
  /** Stricter limit for authentication routes. */
  readonly authRateLimitPerIp?: number;
}

const DEFAULT_RATE_LIMIT = 2000;
const DEFAULT_AUTH_RATE_LIMIT = 100;

/** CloudFront with TLSv1.2_2021, WAF rate-based rules, the web bucket origin and Tenant subdomain DNS. */
export class EdgeStack extends Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly webAcl: wafv2.CfnWebACL;

  public constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    const visibility = (name: string): wafv2.CfnWebACL.VisibilityConfigProperty => ({
      cloudWatchMetricsEnabled: true,
      sampledRequestsEnabled: true,
      metricName: name,
    });

    this.webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: 'campusconnect-edge',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: visibility('campusconnect-edge'),
      rules: [
        {
          name: 'AuthRateLimit',
          priority: 0,
          action: { block: {} },
          visibilityConfig: visibility('AuthRateLimit'),
          statement: {
            rateBasedStatement: {
              limit: props.authRateLimitPerIp ?? DEFAULT_AUTH_RATE_LIMIT,
              aggregateKeyType: 'IP',
              evaluationWindowSec: 300,
              scopeDownStatement: {
                byteMatchStatement: {
                  searchString: '/api/v1/auth',
                  fieldToMatch: { uriPath: {} },
                  positionalConstraint: 'STARTS_WITH',
                  textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
                },
              },
            },
          },
        },
        {
          name: 'GlobalRateLimit',
          priority: 1,
          action: { block: {} },
          visibilityConfig: visibility('GlobalRateLimit'),
          statement: {
            rateBasedStatement: {
              limit: props.rateLimitPerIp ?? DEFAULT_RATE_LIMIT,
              aggregateKeyType: 'IP',
              evaluationWindowSec: 300,
            },
          },
        },
        {
          name: 'IpReputation',
          priority: 2,
          overrideAction: { none: {} },
          visibilityConfig: visibility('IpReputation'),
          statement: {
            managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesAmazonIpReputationList' },
          },
        },
        {
          name: 'CommonRules',
          priority: 3,
          overrideAction: { none: {} },
          visibilityConfig: visibility('CommonRules'),
          statement: {
            managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesCommonRuleSet' },
          },
        },
        {
          name: 'KnownBadInputs',
          priority: 4,
          overrideAction: { none: {} },
          visibilityConfig: visibility('KnownBadInputs'),
          statement: {
            managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesKnownBadInputsRuleSet' },
          },
        },
      ],
    });

    const webBucket = s3.Bucket.fromBucketAttributes(this, 'WebBucket', {
      bucketName: props.webBucketName,
      region: props.webBucketRegion,
    });
    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', props.cloudFrontCertificateArn);

    const albOrigin = new origins.HttpOrigin(props.albDomainName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
      readTimeout: Duration.seconds(30),
    });
    const apiBehavior: cloudfront.BehaviorOptions = {
      origin: albOrigin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      // The viewer Host (the Tenant subdomain) reaches the API; the ALB certificate must cover `*.<baseDomain>`.
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      compress: true,
    };

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'CampusConnect web and API edge',
      domainNames: [props.baseDomain, `*.${props.baseDomain}`],
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      webAclId: this.webAcl.attrArn,
      defaultRootObject: 'index.html',
      enableIpv6: true,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        compress: true,
      },
      additionalBehaviors: {
        'api/*': apiBehavior,
        'health/*': apiBehavior,
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.seconds(10) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.seconds(10) },
      ],
    });

    // Tenant subdomains: <slug>.<baseDomain> resolves to the distribution through the wildcard record.
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.baseDomain,
    });
    const target = route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(this.distribution));
    for (const [rid, recordName] of [
      ['Apex', undefined],
      ['TenantWildcard', '*'],
    ] as const) {
      new route53.ARecord(this, `${rid}A`, { zone, recordName, target });
      new route53.AaaaRecord(this, `${rid}Aaaa`, { zone, recordName, target });
    }
  }
}
