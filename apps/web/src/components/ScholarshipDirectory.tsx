import { useMemo, useState } from 'react';
import { GlassCard } from './GlassCard';

export interface OpportunityItem {
  readonly id: string;
  readonly type: 'scholarship' | 'internship' | 'research';
  readonly organization: string;
  readonly schemeName: string;
  readonly eligibility: string;
  readonly category: string;
  readonly grantAmount: string;
  readonly deadline: string;
  readonly deadlineStatus: 'Active' | 'Closing Soon' | 'Open for 2026';
  readonly officialUrl: string;
  readonly tags: readonly string[];
  readonly verifiedGovt: boolean;
}

export const VERIFIED_OPPORTUNITIES: readonly OpportunityItem[] = [
  {
    id: 'opp_nsp_01',
    type: 'scholarship',
    organization: 'Ministry of Electronics & IT / Ministry of Education, Govt. of India',
    schemeName: 'National Scholarship Portal (NSP) — Post-Matric Scholarships',
    eligibility: 'UG/PG students enrolled in recognized institutions; Family income < ₹2.5L - ₹4.5L/yr across Central Schemes.',
    category: 'Merit-cum-Means / SC / ST / OBC / Minorities',
    grantAmount: '₹20,000 to ₹75,000 / year + Tuition waiver',
    deadline: '30 November 2026',
    deadlineStatus: 'Active',
    officialUrl: 'https://scholarships.gov.in/',
    tags: ['Central Govt', 'Direct Benefit Transfer (DBT)', 'All Branches'],
    verifiedGovt: true,
  },
  {
    id: 'opp_aicte_pragati',
    type: 'scholarship',
    organization: 'All India Council for Technical Education (AICTE)',
    schemeName: 'AICTE Pragati Scholarship for Girls (Technical Degree)',
    eligibility: 'Female students admitted to 1st year of Degree level course in AICTE approved institutions; Family income < ₹8L/yr.',
    category: 'Women in STEM / Engineering',
    grantAmount: '₹50,000 / annum (for every year of study)',
    deadline: '15 December 2026',
    deadlineStatus: 'Closing Soon',
    officialUrl: 'https://www.aicte-india.org/schemes/students-development-schemes/Pragati',
    tags: ['AICTE', 'Women in Tech', 'B.Tech / B.E.'],
    verifiedGovt: true,
  },
  {
    id: 'opp_pm_usp',
    type: 'scholarship',
    organization: 'Department of Higher Education, Govt. of India',
    schemeName: 'PM-USP Central Sector Scheme of Scholarship for College Students',
    eligibility: 'Above 80th percentile in Class 12 board exams; Regular degree students; Family income < ₹4.5L/yr.',
    category: 'Higher Education Merit',
    grantAmount: '₹12,000/yr (UG) & ₹20,000/yr (PG)',
    deadline: '31 December 2026',
    deadlineStatus: 'Active',
    officialUrl: 'https://www.education.gov.in/pm-usp',
    tags: ['Class 12 Merit', 'Direct Transfer', 'Central Sector'],
    verifiedGovt: true,
  },
  {
    id: 'opp_iitkgp_intern',
    type: 'research',
    organization: 'Indian Institute of Technology Kharagpur',
    schemeName: 'IIT Kharagpur Summer Undergraduate Research Fellowship',
    eligibility: '2nd/3rd Year B.Tech students with CGPA >= 8.5/10; Top 10% in departmental batch.',
    category: 'Academic Research & Innovation',
    grantAmount: 'Stipend ₹10,000/month + Campus accommodation',
    deadline: '10 January 2027',
    deadlineStatus: 'Open for 2026',
    officialUrl: 'https://www.iitkgp.ac.in/',
    tags: ['IIT Lab Access', 'Summer Fellowship', 'AI & ML / Robotics'],
    verifiedGovt: true,
  },
  {
    id: 'opp_iisc_summer',
    type: 'research',
    organization: 'Indian Institute of Science (IISc Bangalore)',
    schemeName: 'IISc Summer Fellowship Programme in Science & Engineering',
    eligibility: 'SC/ST/OBC students studying 2nd year B.Sc / 3rd year B.E./B.Tech with consistent distinction.',
    category: 'Premier Research Lab',
    grantAmount: 'Monthly stipend ₹5,000 + Book grant + Travel allowance',
    deadline: '20 January 2027',
    deadlineStatus: 'Open for 2026',
    officialUrl: 'https://iisc.ac.in/admissions/summer-fellowship-programme/',
    tags: ['IISc Bangalore', 'Direct Faculty Mentorship', 'Computing'],
    verifiedGovt: true,
  },
  {
    id: 'opp_reliance_stem',
    type: 'scholarship',
    organization: 'Reliance Foundation',
    schemeName: 'Reliance Foundation Undergraduate STEM Scholarship',
    eligibility: '1st Year full-time undergraduate students enrolled in STEM disciplines; Aptitude test performance.',
    category: 'Private Merit-cum-Means',
    grantAmount: 'Up to ₹2,00,000 over course duration',
    deadline: '25 November 2026',
    deadlineStatus: 'Closing Soon',
    officialUrl: 'https://www.scholarships.reliancefoundation.org/',
    tags: ['STEM Scholars', 'Mentorship & Alumni', 'B.Tech CSE/IT/ECE'],
    verifiedGovt: false,
  },
  {
    id: 'opp_swayam_nptel',
    type: 'internship',
    organization: 'Ministry of Education & NPTEL SWAYAM',
    schemeName: 'NPTEL Topper Research Internship & Industry Placement Gateway',
    eligibility: 'Enrolled college students scoring Gold or Elite distinction in NPTEL proctored online courses.',
    category: 'Skills & Industry Placement',
    grantAmount: 'Internship with IIT Professors & corporate R&D stipends',
    deadline: 'Rolling Admissions',
    deadlineStatus: 'Active',
    officialUrl: 'https://swayam.gov.in/',
    tags: ['NPTEL', 'Industry Recognized', 'Online Modules'],
    verifiedGovt: true,
  },
  {
    id: 'opp_aicte_saksham',
    type: 'scholarship',
    organization: 'AICTE / Ministry of Education',
    schemeName: 'AICTE Saksham Scholarship for Specially-Abled Students',
    eligibility: 'Specially-abled students with disability not less than 40%; Admitted to degree technical programs.',
    category: 'Inclusion & Technical Education',
    grantAmount: '₹50,000 / year + Study assistive support',
    deadline: '15 December 2026',
    deadlineStatus: 'Active',
    officialUrl: 'https://www.aicte-india.org/schemes/students-development-schemes/Saksham',
    tags: ['Inclusion', 'Special Needs', 'Technical Degrees'],
    verifiedGovt: true,
  },
];

export function ScholarshipDirectory() {
  const [filterType, setFilterType] = useState<'all' | 'scholarship' | 'research' | 'internship'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOpportunities = useMemo(() => {
    return VERIFIED_OPPORTUNITIES.filter((opp) => {
      if (filterType !== 'all' && opp.type !== filterType) {
        return false;
      }
      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase();
        const matchesName = opp.schemeName.toLowerCase().includes(q);
        const matchesOrg = opp.organization.toLowerCase().includes(q);
        const matchesCat = opp.category.toLowerCase().includes(q);
        const matchesTags = opp.tags.some((t) => t.toLowerCase().includes(q));
        return matchesName || matchesOrg || matchesCat || matchesTags;
      }
      return true;
    });
  }, [filterType, searchTerm]);

  return (
    <section className="cc-scholarship-gateway" aria-labelledby="scholarship-gateway-title">
      {/* Header Banner */}
      <GlassCard className="cc-gateway-hero" style={{ marginBottom: '1.5rem', padding: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
              VERIFIED INDIAN GOVERNMENT & INSTITUTIONAL GATEWAY
            </div>
            <h2 id="scholarship-gateway-title" style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f2850', margin: '0 0 0.4rem', letterSpacing: '-0.02em' }}>
              Curated Scholarship & Internship Gateway
            </h2>
            <p style={{ color: '#475569', fontSize: '0.925rem', maxWidth: '680px', margin: 0, lineHeight: 1.5 }}>
              Zero-friction directory for JIS University students. Direct links to verified portals without advertisements, intermediary brokers, or internal redirection loops.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#0f2850', fontWeight: 700, background: '#fffbeb', border: '1px solid #fef08a', padding: '0.35rem 0.85rem', borderRadius: '9999px' }}>
              ⚡ 100% Direct Official Links
            </span>
          </div>
        </div>

        {/* Filter Controls & Search */}
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderTop: '1px solid rgba(15, 40, 80, 0.08)', paddingTop: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(
              [
                { id: 'all', label: 'All Schemes', count: VERIFIED_OPPORTUNITIES.length },
                { id: 'scholarship', label: 'Scholarships', count: VERIFIED_OPPORTUNITIES.filter((o) => o.type === 'scholarship').length },
                { id: 'research', label: 'Research Fellowships', count: VERIFIED_OPPORTUNITIES.filter((o) => o.type === 'research').length },
                { id: 'internship', label: 'Industry & Certs', count: VERIFIED_OPPORTUNITIES.filter((o) => o.type === 'internship').length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`cc-gateway-tab ${filterType === tab.id ? 'active' : ''}`}
              >
                {tab.label} <span className="cc-gateway-tab-count">({tab.count})</span>
              </button>
            ))}
          </div>

          <div style={{ minWidth: '260px' }}>
            <input
              type="search"
              placeholder="Search scheme, branch, or keywords…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="cc-gateway-search-input"
              aria-label="Search scholarships and internships"
            />
          </div>
        </div>
      </GlassCard>

      {/* Grid of Verified Schemes */}
      <div className="cc-gateway-grid">
        {filteredOpportunities.map((opp) => (
          <GlassCard key={opp.id} interactive className="cc-opportunity-card">
            <div className="cc-opp-header">
              <div className="cc-opp-org-badge">
                <span className="cc-circle-dot" />
                {opp.organization}
              </div>
              <span
                className={`cc-opp-status-badge ${opp.deadlineStatus === 'Closing Soon' ? 'closing' : 'active'}`}
              >
                {opp.deadlineStatus === 'Closing Soon' ? '⚠️ ' : '● '}
                {opp.deadlineStatus}
              </span>
            </div>

            <h3 className="cc-opp-title">{opp.schemeName}</h3>

            <div className="cc-opp-grant-box">
              <span className="cc-opp-grant-label">Grant / Benefit</span>
              <strong className="cc-opp-grant-amount">{opp.grantAmount}</strong>
            </div>

            <div className="cc-opp-detail-block">
              <span className="cc-opp-detail-label">Eligibility Criteria:</span>
              <p className="cc-opp-eligibility">{opp.eligibility}</p>
            </div>

            <div className="cc-opp-detail-row">
              <span className="cc-opp-detail-label">Category:</span>
              <span className="cc-opp-detail-val">{opp.category}</span>
            </div>

            <div className="cc-opp-detail-row">
              <span className="cc-opp-detail-label">Deadline:</span>
              <span className="cc-opp-deadline-val">{opp.deadline}</span>
            </div>

            <div className="cc-opp-tags-row">
              {opp.tags.map((tag) => (
                <span key={tag} className="cc-opp-tag">
                  {tag}
                </span>
              ))}
            </div>

            {/* High-visibility Direct Action Button */}
            <div className="cc-opp-footer">
              <a
                href={opp.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cc-opp-direct-btn"
                title={`Open official portal for ${opp.schemeName} (external link opens in new tab)`}
              >
                <span>Open Official Portal</span>
                <span className="cc-external-arrow" aria-hidden="true">↗</span>
              </a>
            </div>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}

export default ScholarshipDirectory;

