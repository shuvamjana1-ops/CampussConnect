import { Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as networkfirewall from 'aws-cdk-lib/aws-networkfirewall';
import type { Construct } from 'constructs';

export interface NetworkStackProps extends StackProps {
  /** Domain suffixes allowed for egress (leading dot matches subdomains). */
  readonly egressAllowlist?: readonly string[];
}

const DEFAULT_EGRESS_ALLOWLIST = ['.amazonaws.com', '.amazonaws.com.cn'] as const;

/** VPC across 3 AZs, NAT, Network Firewall egress allowlist and VPC endpoints. */
export class NetworkStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly firewall: networkfirewall.CfnFirewall;

  public constructor(scope: Construct, id: string, props: NetworkStackProps = {}) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 3,
      natGateways: 3,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    this.vpc.addFlowLog('FlowLog');

    // Firewall endpoints are placed in one subnet per AZ.
    const firewallSubnets = this.vpc.publicSubnets;
    const allowlist = [...(props.egressAllowlist ?? DEFAULT_EGRESS_ALLOWLIST)];

    const domainRuleGroup = new networkfirewall.CfnRuleGroup(this, 'EgressAllowlist', {
      capacity: 100,
      type: 'STATEFUL',
      ruleGroupName: 'campusconnect-egress-allowlist',
      ruleGroup: {
        rulesSource: {
          rulesSourceList: {
            generatedRulesType: 'ALLOWLIST',
            targetTypes: ['HTTP_HOST', 'TLS_SNI'],
            targets: allowlist,
          },
        },
        statefulRuleOptions: { ruleOrder: 'STRICT_ORDER' },
      },
    });

    const policy = new networkfirewall.CfnFirewallPolicy(this, 'FirewallPolicy', {
      firewallPolicyName: 'campusconnect-egress',
      firewallPolicy: {
        statelessDefaultActions: ['aws:forward_to_sfe'],
        statelessFragmentDefaultActions: ['aws:forward_to_sfe'],
        statefulDefaultActions: ['aws:drop_established', 'aws:alert_established'],
        statefulEngineOptions: { ruleOrder: 'STRICT_ORDER' },
        statefulRuleGroupReferences: [
          { resourceArn: domainRuleGroup.attrRuleGroupArn, priority: 1 },
        ],
      },
    });

    this.firewall = new networkfirewall.CfnFirewall(this, 'Firewall', {
      firewallName: 'campusconnect-egress',
      firewallPolicyArn: policy.attrFirewallPolicyArn,
      vpcId: this.vpc.vpcId,
      deleteProtection: true,
      subnetMappings: firewallSubnets.map((s) => ({ subnetId: s.subnetId })),
    });

    // Gateway endpoints (no hourly cost).
    this.vpc.addGatewayEndpoint('S3Endpoint', { service: ec2.GatewayVpcEndpointAwsService.S3 });
    this.vpc.addGatewayEndpoint('DynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    // Interface endpoints keep AWS API traffic off the NAT path.
    const interfaceServices: Record<string, ec2.InterfaceVpcEndpointAwsService> = {
      Ecr: ec2.InterfaceVpcEndpointAwsService.ECR,
      EcrDocker: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      Logs: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      Sqs: ec2.InterfaceVpcEndpointAwsService.SQS,
      SecretsManager: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      Kms: ec2.InterfaceVpcEndpointAwsService.KMS,
      Ses: ec2.InterfaceVpcEndpointAwsService.EMAIL_SMTP,
      Scheduler: new ec2.InterfaceVpcEndpointAwsService('scheduler'),
      Events: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_EVENTS,
    };
    for (const [name, service] of Object.entries(interfaceServices)) {
      this.vpc.addInterfaceEndpoint(`${name}Endpoint`, {
        service,
        privateDnsEnabled: true,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      });
    }
  }
}
