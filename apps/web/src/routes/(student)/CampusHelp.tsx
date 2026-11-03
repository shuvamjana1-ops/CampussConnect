import { Badge, TextField } from '@campusconnect/ui';
import { useState } from 'react';
import { Link } from 'react-router';

interface HelplineItem {
  readonly id: string;
  readonly title: string;
  readonly number: string;
  readonly tel: string;
  readonly desc: string;
  readonly badge: string;
  readonly badgeTone: 'danger' | 'warning' | 'info' | 'ai';
  readonly bgColor: string;
  readonly borderColor: string;
  readonly titleColor: string;
}

const HELPLINES: readonly HelplineItem[] = [
  {
    id: 'security',
    title: 'Campus Security Control',
    number: '+91-11-2659-1000',
    tel: '+911126591000',
    desc: 'Main Gate / Quick Response Team (24x7)',
    badge: 'Immediate Response',
    badgeTone: 'danger',
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
    titleColor: '#991b1b',
  },
  {
    id: 'health',
    title: 'Health Center & Ambulance',
    number: '+91-11-2659-1500',
    tel: '+911126591500',
    desc: 'Emergency Medical Ward & Pharmacy',
    badge: 'Medical Ward',
    badgeTone: 'info',
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe',
    titleColor: '#1e3a8a',
  },
  {
    id: 'womens_nat',
    title: "Women's National Helpline",
    number: '1091',
    tel: '1091',
    desc: 'National 24x7 Emergency for Women in Distress',
    badge: 'Toll-Free 24x7',
    badgeTone: 'danger',
    bgColor: '#fdf2f8',
    borderColor: '#fbcfe8',
    titleColor: '#9d174d',
  },
  {
    id: 'womens_icc',
    title: "Women's Cell / ICC",
    number: '+91-11-2659-1800',
    tel: '+911126591800',
    desc: 'Internal Complaints Committee & Gender Cell',
    badge: 'Confidential',
    badgeTone: 'ai',
    bgColor: '#f5f3ff',
    borderColor: '#ddd6fe',
    titleColor: '#5b21b6',
  },
  {
    id: 'anti_ragging',
    title: 'National Anti-Ragging',
    number: '1800-180-5522',
    tel: '18001805522',
    desc: 'Toll-Free 24x7 UGC Anti-Ragging Helpline',
    badge: 'Statutory Zero-Tolerance',
    badgeTone: 'warning',
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    titleColor: '#92400e',
  },
  {
    id: 'tele_manas',
    title: 'Mental Health (Tele-MANAS)',
    number: '14416',
    tel: '14416',
    desc: 'MoHFW National Tele-Mental Health 24x7 Counsel',
    badge: 'Confidential Care',
    badgeTone: 'info',
    bgColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    titleColor: '#065f46',
  },
];

interface FaqItem {
  readonly q: string;
  readonly a: string;
  readonly category: string;
}

const FAQS: readonly FaqItem[] = [
  {
    category: 'Examination',
    q: 'How do I request a correction for my internal assessment marks?',
    a: 'Submit a Grievance ticket under "Examination › Marks Correction" within 7 days of the marks publication on the portal. Attach a photo/scan of your evaluated answer script or signature sheet. The Exam Officer will verify with the faculty evaluator.',
  },
  {
    category: 'Examination',
    q: 'What is the deadline for end-semester hall ticket generation?',
    a: 'Hall tickets are released 5 working days before examinations commence. Ensure you have no pending course attendance holds (minimum 75% required) or outstanding semester fees.',
  },
  {
    category: 'Grievance',
    q: 'What does "Keep my identity confidential" mean when filing a complaint?',
    a: 'When you choose Confidential, your name and roll number are cryptographically sealed. Only the University Ombudsperson and handlers explicitly authorised by them can inspect your identity. Your department handlers only see the factual details to resolve the issue.',
  },
  {
    category: 'Grievance',
    q: 'What happens if a ticket is not resolved within the SLA deadline?',
    a: 'CampusConnect automatically escalates the ticket. If an L1 handler misses the committed deadline, the ticket escalates to Level 2 (Head of Department). If unresolved at L2, it escalates to Level 3 (Grievance Committee & Ombudsperson).',
  },
  {
    category: 'Hostel',
    q: 'How quickly are hostel plumbing or electrical complaints resolved?',
    a: 'Critical safety issues (power sparks, major water leaks) carry a P0/P1 SLA of 4 to 24 hours. General maintenance requests have an SLA of 48 business hours.',
  },
  {
    category: 'Scholarships',
    q: 'How does CampusConnect match scholarships to my profile?',
    a: 'Our semantic matching engine checks your department, year, semester, CGPA, and optional income bracket against government schemes (NSP, AICTE) and university trusts. You receive automatic alerts when new matches open.',
  },
];

export default function CampusHelp() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [expandedQ, setExpandedQ] = useState<string | null>(FAQS[0]?.q ?? null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = ['All', 'Examination', 'Grievance', 'Hostel', 'Scholarships'] as const;

  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const filteredFaqs = FAQS.filter((f) => {
    const matchesSearch =
      f.q.toLowerCase().includes(search.toLowerCase()) ||
      f.a.toLowerCase().includes(search.toLowerCase()) ||
      f.category.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || f.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <div className="cc-page-header">
        <div>
          <h2 className="cc-page-title">Campus Help & Grievance Guide</h2>
          <p className="cc-page-desc">
            Essential campus helplines, university department contacts, and grievance redressal guidelines.
          </p>
        </div>
        <Link to="/student/new" className="cc-button cc-button-saffron">
          + Raise a Request
        </Link>
      </div>

      {/* 24x7 Emergency Hotlines Banner */}
      <div
        className="cc-card"
        style={{
          borderLeft: '4px solid #b91c1c',
          background: '#fff',
          marginBottom: '1.5rem',
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🚨</span>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#991b1b' }}>
              24x7 Campus Emergency & Safety Helplines
            </h3>
          </div>
          <Badge tone="danger" icon="●">
            Active 24/7 Response
          </Badge>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {HELPLINES.map((h) => (
            <div
              key={h.id}
              style={{
                background: h.bgColor,
                padding: '0.9rem',
                borderRadius: '8px',
                border: `1px solid ${h.borderColor}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: h.titleColor, textTransform: 'uppercase' }}>
                    {h.title}
                  </div>
                  <span className="cc-badge" data-tone={h.badgeTone} style={{ fontSize: '0.7rem' }}>
                    {h.badge}
                  </span>
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', margin: '0.2rem 0' }}>
                  {h.number}
                </div>
                <div style={{ fontSize: '0.775rem', color: '#64748b', marginBottom: '0.75rem' }}>
                  {h.desc}
                </div>
              </div>

              {/* 1-Click Call and Copy Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: 'auto' }}>
                <a
                  href={`tel:${h.tel}`}
                  className="cc-button"
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    textDecoration: 'none',
                    fontSize: '0.8rem',
                    padding: '0.4rem 0.6rem',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    borderRadius: '6px',
                    fontWeight: 600,
                  }}
                >
                  📞 Call Now
                </a>
                <button
                  type="button"
                  onClick={() => {
                    handleCopy(h.id, h.number);
                  }}
                  className="cc-button"
                  style={{
                    flex: 1,
                    fontSize: '0.8rem',
                    padding: '0.4rem 0.6rem',
                    background: copiedId === h.id ? '#ecfdf5' : '#ffffff',
                    borderColor: copiedId === h.id ? '#10b981' : '#cbd5e1',
                    color: copiedId === h.id ? '#047857' : '#0f172a',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {copiedId === h.id ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3-Tier Grievance Redressal Process Guide */}
      <div className="cc-card" style={{ marginBottom: '1.5rem' }}>
        <div className="cc-card-header">
          <h3 className="cc-card-title">
            <span>⚖️</span> University 3-Tier Grievance Redressal Workflow
          </h3>
          <span className="cc-badge" data-tone="info">
            Enforced by SLA Engine
          </span>
        </div>

        <p style={{ fontSize: '0.875rem', color: '#475569', margin: '0 0 1.25rem' }}>
          Every grievance filed in CampusConnect follows statutory due process under University Grants Commission regulations:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span className="cc-badge" data-tone="neutral">Level 1</span>
              <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>Department Handler</strong>
            </div>
            <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
              Initial investigation and factual verification by the concerned department officer (e.g. Exam Superintendent).
            </p>
            <div style={{ fontSize: '0.8rem', color: '#0d9488', fontWeight: 600 }}>
              ⏱️ SLA Target: 2 Business Days
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span className="cc-badge" data-tone="warning">Level 2</span>
              <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>Head of Department / Dean</strong>
            </div>
            <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
              Triggered automatically upon SLA breach or student dispute. Review conducted by academic department leadership.
            </p>
            <div style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 600 }}>
              ⏱️ SLA Target: 3 Business Days
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span className="cc-badge" data-tone="ai">Level 3</span>
              <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>University Ombudsperson</strong>
            </div>
            <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
              Independent appellate authority for contested decisions, sensitive matters, and confidential complaints.
            </p>
            <div style={{ fontSize: '0.8rem', color: '#5b21b6', fontWeight: 600 }}>
              ⏱️ Formal Decision within 10 Days
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1rem', background: '#ecfdf5', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #a7f3d0', fontSize: '0.85rem', color: '#065f46' }}>
          <strong>7-Day Student Confirmation Window:</strong> After a handler marks a ticket resolved, you have 7 days to confirm and rate (1 to 5 stars) or dispute with a reason. No ticket can be closed unilaterally without your verification.
        </div>
      </div>

      {/* Frequently Asked Questions with Category Filter and Accessible Accordion */}
      <div className="cc-card">
        <div className="cc-card-header">
          <div>
            <h3 className="cc-card-title">
              <span>❓</span> Frequently Asked Questions
            </h3>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              Instant answers regarding marks corrections, hall tickets, and grievance privacy.
            </span>
          </div>
          <div style={{ width: '240px' }}>
            <TextField label="Search FAQs" value={search} onChange={setSearch} />
          </div>
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setSelectedCategory(cat);
              }}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '999px',
                border: `1px solid ${selectedCategory === cat ? '#1e3a8a' : '#e2e8f0'}`,
                background: selectedCategory === cat ? '#1e3a8a' : '#f8fafc',
                color: selectedCategory === cat ? '#ffffff' : '#475569',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {filteredFaqs.length === 0 ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '1.5rem' }}>
            No matching questions found. Use the "Raise a Request" button to contact your department.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredFaqs.map((faq, idx) => {
              const isExpanded = expandedQ === faq.q;
              return (
                <div
                  key={faq.q}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    background: isExpanded ? '#f8fafc' : '#ffffff',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    id={`faq-btn-${String(idx)}`}
                    aria-controls={`faq-panel-${String(idx)}`}
                    aria-expanded={isExpanded}
                    onClick={() => {
                      setExpandedQ(isExpanded ? null : faq.q);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.85rem 1rem',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '1rem',
                      minHeight: '44px',
                    }}
                  >
                    <div>
                      <span className="cc-badge" data-tone="neutral" style={{ marginRight: '0.5rem', fontSize: '0.75rem' }}>
                        {faq.category}
                      </span>
                      <strong style={{ fontSize: '0.925rem', color: '#0f172a' }}>{faq.q}</strong>
                    </div>
                    <span style={{ color: '#64748b', fontSize: '1.1rem', flexShrink: 0 }}>
                      {isExpanded ? '−' : '+'}
                    </span>
                  </button>

                  {isExpanded && (
                    <div
                      id={`faq-panel-${String(idx)}`}
                      role="region"
                      aria-labelledby={`faq-btn-${String(idx)}`}
                      style={{
                        padding: '0 1rem 1rem',
                        fontSize: '0.875rem',
                        color: '#475569',
                        lineHeight: 1.5,
                        borderTop: '1px solid #f1f5f9',
                      }}
                    >
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
