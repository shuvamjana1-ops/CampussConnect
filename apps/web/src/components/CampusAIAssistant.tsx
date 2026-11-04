import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Bot,
  Send,
  ExternalLink,
  BookOpen,
  Ticket,
  Building2,
  Award,
  DollarSign,
  User,
  RotateCcw,
} from 'lucide-react';
import { GlassCard } from './GlassCard';

export interface Message {
  readonly id: string;
  readonly sender: 'user' | 'assistant';
  readonly text: string;
  readonly timestamp: string;
  readonly actions?: readonly {
    readonly label: string;
    readonly tab: string;
    readonly iconName: 'ac' | 'hallticket' | 'hostel' | 'certificates' | 'scholarships';
  }[];
}

const KNOWLEDGE_RESPONSES: readonly {
  readonly keywords: readonly string[];
  readonly answer: string;
  readonly actions?: readonly {
    readonly label: string;
    readonly tab: string;
    readonly iconName: 'ac' | 'hallticket' | 'hostel' | 'certificates' | 'scholarships';
  }[];
}[] = [
  {
    keywords: ['attendance', '75%', 'bunk', 'shortage', 'classes', 'margin'],
    answer:
      'Under JIS University & UGC Regulations, students must maintain a minimum of 75.0% aggregate lecture attendance to be eligible for End-Semester Examinations and receive an Exam Hall Ticket.\n\n• >= 75%: Eligible for Hall Ticket.\n• 65% – 74.9%: Eligible for Condonation upon submitting official Medical Certificates / HoD approval within 3 days.\n• < 65%: Barred from sitting in examinations (Detained).\n\nYou can use our interactive 75% Target & Bunk Margin Calculator in the Academic Section to test what-if scenarios!',
    actions: [
      { label: '📊 Open Academic Section & Calculator', tab: 'ac', iconName: 'ac' },
      { label: '🎟️ Check Hall Ticket Status', tab: 'hallticket', iconName: 'hallticket' },
    ],
  },
  {
    keywords: ['hall ticket', 'admit card', 'exam', 'seating', 'timetable', 'schedule'],
    answer:
      'Your Digital Exam Admit Card for Odd Semester 2026 is officially issued! It includes your candidate dossier, circular photo, Odd Semester subject timetable (CS301–CS305), designated seating in Exam Hall B (Desk B-42), statutory clearance checkmarks, and cryptographic QR seal.\n\nYou can view and print it directly from the Exam Hall Ticket tab.',
    actions: [
      { label: '🎟️ View & Print Exam Hall Ticket', tab: 'hallticket', iconName: 'hallticket' },
    ],
  },
  {
    keywords: ['marks', 'dispute', 'mismatch', 'script', 'internal', 'evaluator', 'assessment'],
    answer:
      'JIS University provides a strict 7-day Dispute Window following the publication of internal marks. If you notice a disparity (e.g. 12/30 on portal vs 22/30 on your signed physical booklet), you can immediately flag an Academic Marks Grievance with client-compressed photo proof of your evaluated answer script.\n\nYour grievance will be automatically escalated to P0 if close to the hall ticket cutoff.',
    actions: [
      { label: '📊 Open Academic Section (AC)', tab: 'ac', iconName: 'ac' },
      { label: '➕ Lodge Academic Grievance', tab: 'lodge', iconName: 'ac' },
    ],
  },
  {
    keywords: ['hostel', 'outpass', 'gate', 'curfew', 'warden', 'leave', 'residence'],
    answer:
      'Hostel gate passes for Mandakini Girls, Bhagirathi Boys, and Alakananda PG Residences require Warden verification. The campus entry curfew is strictly 08:00 PM for day outpasses.\n\nOnce approved by the warden desk, a digital QR Outpass Slip is generated, which Campus Gate 1 security scans during departure and return.',
    actions: [
      { label: '🏢 Open Hostel Gate Pass Desk', tab: 'hostel', iconName: 'hostel' },
    ],
  },
  {
    keywords: ['certificate', 'bonafide', 'no dues', 'fee structure', 'passport', 'loan'],
    answer:
      'You can instantly generate and print official, Registrar-certified institutional E-Certificates with cryptographic QR seals:\n\n1. 📜 Bonafide Student Certificate (Passports, Visas, Metro)\n2. 💰 Course Fee Structure & Estimation (Education Loans)\n3. 🛡️ Digital No-Dues Institutional Clearance (Library, Accounts, Hostel, Labs)',
    actions: [
      { label: '📜 Open Institutional E-Certificates', tab: 'certificates', iconName: 'certificates' },
    ],
  },
  {
    keywords: ['scholarship', 'svmcm', 'nsp', 'pragati', 'funding', 'fellowship', 'grant'],
    answer:
      'Active scholarship opportunities at JIS University include:\n\n• Swami Vivekananda Merit-cum-Means (SVMCM): ₹18,000 – ₹60,000/yr for WB residents with >=60% marks.\n• National Scholarship Portal (NSP): Post-Matric & Central Sector Schemes.\n• AICTE Pragati Scholarship for Girls: ₹50,000/yr.\n\nVisit the Scholarship Gateway to check eligibility and deadlines.',
    actions: [
      { label: '🎯 Open Scholarship Gateway', tab: 'scholarships', iconName: 'scholarships' },
    ],
  },
];

export function CampusAIAssistant() {
  const [, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<readonly Message[]>([
    {
      id: 'msg_welcome',
      sender: 'assistant',
      text: 'Hello Ananya! I am CampusConnect AI, your 24/7 JIS University statutory and student services assistant. Ask me anything about 75% attendance cutoffs, hall ticket admit cards, internal marks disputes, hostel curfews, e-certificates, or scholarships!',
      timestamp: 'Just now',
      actions: [
        { label: '📊 75% Attendance Calculator', tab: 'ac', iconName: 'ac' },
        { label: '🎟️ Exam Hall Ticket', tab: 'hallticket', iconName: 'hallticket' },
        { label: '🏢 Hostel Gate Pass', tab: 'hostel', iconName: 'hostel' },
        { label: '📜 E-Certificates', tab: 'certificates', iconName: 'certificates' },
      ],
    },
  ]);
  const [inputValue, setInputValue] = useState('');

  const quickInquiries = [
    'What is the 75% attendance rule & safe margin?',
    'Where is my Exam Hall Ticket for Odd Sem 2026?',
    'How do I challenge my internal marks discrepancy?',
    'What are the hostel outpass curfew hours?',
    'How can I get an official Bonafide Certificate?',
    'What government scholarships are currently open?',
  ];

  const handleSendQuery = (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: `msg_u_${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: 'Just now',
    };

    const lower = text.toLowerCase();
    const matched = KNOWLEDGE_RESPONSES.find((item) =>
      item.keywords.some((k) => lower.includes(k))
    );

    const replyText =
      matched?.answer ||
      `I understand your query regarding "${text}". JIS University regulations cover academic governance, examination protocols, hostel residences, and digital student certificates. You can explore relevant portal sections via the deep-links below or ask specifically about attendance, hall tickets, hostel outpasses, or marks disputes!`;

    const assistantMsg: Message = {
      id: `msg_a_${Date.now()}`,
      sender: 'assistant',
      text: replyText,
      timestamp: 'Just now',
      ...(matched?.actions ? { actions: matched.actions } : {}),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInputValue('');
  };

  const handleActionClick = (tab: string) => {
    setSearchParams({ tab });
  };

  const renderActionIcon = (iconName: string) => {
    switch (iconName) {
      case 'ac':
        return <BookOpen size={13} />;
      case 'hallticket':
        return <Ticket size={13} />;
      case 'hostel':
        return <Building2 size={13} />;
      case 'certificates':
        return <Award size={13} />;
      case 'scholarships':
        return <DollarSign size={13} />;
      default:
        return <ExternalLink size={13} />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <GlassCard
        material="glass"
        style={{
          padding: '24px',
          borderLeft: '4px solid #38bdf8',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 12px',
                borderRadius: '9999px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                marginBottom: '10px',
              }}
            >
              <Bot size={14} />
              <span>CAMPUSCONNECT AI STATUTORY COMPLIANCE &amp; SERVICES AGENT</span>
            </div>

            <h2
              style={{
                fontSize: '1.6rem',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                color: '#f8fafc',
                margin: '0 0 6px 0',
              }}
            >
              JIS University Smart Campus AI Assistant
            </h2>
            <p
              style={{
                margin: 0,
                color: '#cbd5e1',
                fontSize: '0.9rem',
                maxWidth: '720px',
                lineHeight: 1.45,
              }}
            >
              Trained on JIS University academic handbooks, statutory attendance regulations, examination admit card
              clearances, hostel outpass guidelines, and institutional scholarship schemes.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setMessages([
                {
                  id: 'msg_welcome',
                  sender: 'assistant',
                  text: 'Conversation reset. How can I assist you with university guidelines, examinations, or student services today?',
                  timestamp: 'Just now',
                },
              ])
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#cbd5e1',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              fontSize: '0.785rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={14} />
            <span>Clear Chat</span>
          </button>
        </div>

        {/* Quick Inquiry Chips */}
        <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
            Frequently Asked Campus Inquiries:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {quickInquiries.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSendQuery(q)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  background: 'rgba(56, 189, 248, 0.1)',
                  color: '#7dd3fc',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  fontSize: '0.785rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Interactive Chat Window */}
      <GlassCard
        material="glass-strong"
        style={{
          padding: '24px',
          borderRadius: '20px',
          background: 'rgba(15, 20, 32, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '440px',
          maxHeight: '620px',
        }}
      >
        {/* Messages Stream */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            paddingRight: '6px',
            marginBottom: '16px',
          }}
        >
          {messages.map((m) => {
            const isUser = m.sender === 'user';
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '4px',
                  }}
                >
                  <span
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: isUser ? '#2563eb' : 'linear-gradient(135deg, #0284c7, #38bdf8)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                    }}
                  >
                    {isUser ? <User size={12} /> : <Bot size={12} />}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#cbd5e1' }}>
                    {isUser ? 'You' : 'CampusConnect AI'}
                  </span>
                  <time style={{ fontSize: '0.7rem', color: '#64748b' }}>{m.timestamp}</time>
                </div>

                <div
                  style={{
                    maxWidth: '82%',
                    padding: '14px 18px',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: isUser ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'rgba(24, 32, 50, 0.85)',
                    color: '#f8fafc',
                    border: `1px solid ${isUser ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.12)'}`,
                    fontSize: '0.875rem',
                    lineHeight: 1.55,
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.text}

                  {/* Contextual Action Deep-Link Buttons */}
                  {m.actions && m.actions.length > 0 && (
                    <div
                      style={{
                        marginTop: '12px',
                        paddingTop: '10px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      {m.actions.map((act) => (
                        <button
                          key={act.tab}
                          type="button"
                          onClick={() => handleActionClick(act.tab)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: 'rgba(56, 189, 248, 0.2)',
                            color: '#7dd3fc',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {renderActionIcon(act.iconName)}
                          <span>{act.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Query Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendQuery(inputValue);
          }}
          style={{ display: 'flex', gap: '10px' }}
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask CampusConnect AI (e.g. 'Can I miss 3 more CS302 classes and stay >=75%?')..."
            style={{
              flex: 1,
              padding: '12px 18px',
              borderRadius: '12px',
              background: 'rgba(20, 26, 44, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              color: '#f8fafc',
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 22px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7, #0284c7)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
              opacity: inputValue.trim() ? 1 : 0.5,
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
            }}
          >
            <Send size={15} />
            <span>Ask AI</span>
          </button>
        </form>
      </GlassCard>
    </div>
  );
}

export default CampusAIAssistant;
