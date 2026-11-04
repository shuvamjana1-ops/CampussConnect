import { useState } from 'react';
import {
  Printer,
  ShieldCheck,
  QrCode,
  Award,
  CheckCircle2,
} from 'lucide-react';
import { GlassCard } from './GlassCard';
import { complaintStore, type AcademicRecord } from '../services/complaintStore';

export interface CertificateGeneratorProps {
  readonly studentRoll?: string;
}

export type CertificateType = 'bonafide' | 'fee_structure' | 'no_dues';

export function CertificateGenerator({
  studentRoll = 'JISU/2024/CSE/0842',
}: CertificateGeneratorProps) {
  const [certType, setCertType] = useState<CertificateType>('bonafide');
  const [purpose, setPurpose] = useState('Passport / Visa Application');
  const [academicYear] = useState('2025 – 2026');

  const record: AcademicRecord | null = complaintStore.getACRecord(studentRoll);
  const student = record || {
    studentName: 'Ananya Das',
    rollNumber: 'JISU/2024/CSE/0842',
    department: 'Computer Science & Engineering',
    semester: '4th Semester (UG)',
    cgpa: 8.92,
    dateOfBirth: '15 August 2004',
    permanentAddress: 'Plot 42, Salt Lake Sector V, Kolkata, West Bengal - 700091',
    advisorName: 'Prof. Rahul Mehta',
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const certNumber =
    certType === 'bonafide'
      ? 'JISU/REG/BNF/2026/0491'
      : certType === 'fee_structure'
      ? 'JISU/FIN/FEE/2026/0812'
      : 'JISU/NOD/CLR/2026/0337';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Control Banner */}
      <GlassCard
        material="glass"
        style={{
          padding: '24px',
          borderLeft: '4px solid #6366f1',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 12px',
                borderRadius: '9999px',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#a5b4fc',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                marginBottom: '10px',
              }}
            >
              <Award size={14} />
              <span>SELF-SERVICE INSTITUTIONAL E-CERTIFICATES &amp; CLEARANCES</span>
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
              Institutional E-Certificates &amp; Attestation
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
              Issue official, Registrar-certified digital certificates embedded with QR verification seals.
              Valid for National Scholarships (SVMCM/NSP), Education Loans, Passports, and Metro concessions.
            </p>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
            }}
          >
            <Printer size={16} />
            <span>Print Official Certificate</span>
          </button>
        </div>

        {/* Certificate Configuration Selectors */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '14px',
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
              Select Certificate Document
            </label>
            <select
              value={certType}
              onChange={(e) => setCertType(e.target.value as any)}
              style={{ width: '100%' }}
            >
              <option value="bonafide">📜 Bonafide Student Certificate</option>
              <option value="fee_structure">💰 Course Fee Structure &amp; Estimation Certificate</option>
              <option value="no_dues">🛡️ Digital "No Dues" Institutional Clearance</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
              Specified Purpose / Application
            </label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="Passport / Visa Application">Passport / Visa Application</option>
              <option value="Higher Education Bank Loan (SBI / HDFC / PNB)">Higher Education Bank Loan (SBI / HDFC / PNB)</option>
              <option value="SVMCM / NSP / AICTE Pragati Scholarship">SVMCM / NSP / AICTE Pragati Scholarship</option>
              <option value="Kolkata Metro &amp; Eastern Railway Concession">Kolkata Metro &amp; Eastern Railway Concession</option>
              <option value="Summer Industrial Internship Verification">Summer Industrial Internship Verification</option>
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Certificate Live Preview Sheet */}
      <GlassCard
        material="glass-strong"
        style={{
          padding: '40px 48px',
          borderRadius: '20px',
          background: 'rgba(15, 20, 32, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.6)',
          maxWidth: '880px',
          margin: '0 auto',
          width: '100%',
          color: '#f8fafc',
        }}
      >
        {/* University Crest Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '2px solid rgba(255, 255, 255, 0.2)',
            paddingBottom: '20px',
            marginBottom: '28px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #1d4ed8, #0f2850)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '1.35rem',
                border: '2px solid rgba(255, 255, 255, 0.3)',
              }}
            >
              JIS
            </div>
            <div>
              <h1
                style={{
                  margin: '0 0 4px 0',
                  fontSize: '1.5rem',
                  fontWeight: 900,
                  letterSpacing: '-0.01em',
                  color: '#f8fafc',
                }}
              >
                JIS UNIVERSITY, KOLKATA
              </h1>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                Office of the Registrar · Agarpara, Kolkata, West Bengal - 700109
              </p>
              <div style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '2px', fontWeight: 600 }}>
                Established under West Bengal Act XXII of 2014 · Recognized by UGC
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span
              style={{
                display: 'block',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                color: '#60a5fa',
                fontWeight: 700,
              }}
            >
              Ref No: {certNumber}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Date of Issue: 03 November 2026
            </span>
          </div>
        </div>

        {/* Certificate Title */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h2
            style={{
              margin: '0 0 6px 0',
              fontSize: '1.4rem',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: '#f8fafc',
              textDecoration: 'underline',
              textUnderlineOffset: '6px',
            }}
          >
            {certType === 'bonafide'
              ? 'BONAFIDE STUDENT CERTIFICATE'
              : certType === 'fee_structure'
              ? 'COURSE FEE ESTIMATION & STRUCTURE CERTIFICATE'
              : 'INSTITUTIONAL "NO DUES" CLEARANCE CERTIFICATE'}
          </h2>
          <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 600 }}>
            Academic Year {academicYear}
          </span>
        </div>

        {/* Document Body Variant 1: Bonafide */}
        {certType === 'bonafide' && (
          <div style={{ fontSize: '0.95rem', lineHeight: 1.8, color: '#e2e8f0', marginBottom: '32px' }}>
            <p>
              This is to officially certify that <strong>{student.studentName}</strong>, bearing University Roll
              Number <strong>{student.rollNumber}</strong>, is a bonafide regular student of this University
              enrolled in the <strong>4-Year Bachelor of Technology (B.Tech)</strong> degree program in{' '}
              <strong>{student.department}</strong>, currently studying in the <strong>{student.semester}</strong>.
            </p>
            <p>
              As per the university academic records, their conduct, academic standing, and institutional character
              have been found to be exemplary, maintaining a Cumulative Grade Point Average (CGPA) of{' '}
              <strong>{student.cgpa} / 10.00</strong> with good standing.
            </p>
            <p>
              This institutional certificate is formally issued upon the student's request specifically for the
              purpose of: <strong style={{ color: '#fbbf24' }}>{purpose}</strong>.
            </p>
          </div>
        )}

        {/* Document Body Variant 2: Fee Structure */}
        {certType === 'fee_structure' && (
          <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#e2e8f0', marginBottom: '32px' }}>
            <p>
              This is to certify that <strong>{student.studentName}</strong> (Roll: {student.rollNumber}) is
              enrolled in <strong>B.Tech in {student.department}</strong> (Batch 2024–2028). Below is the itemized
              statutory fee structure for the academic session {academicYear}:
            </p>

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                margin: '16px 0',
                fontSize: '0.85rem',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              <thead>
                <tr style={{ background: 'rgba(30, 41, 59, 0.8)', borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Sl No.</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Fee Component Breakdown</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>Per Semester (INR)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>Annual Total (INR)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <td style={{ padding: '8px 12px' }}>1.</td>
                  <td style={{ padding: '8px 12px' }}>Tuition &amp; Instructional Fee</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹ 55,000</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹ 1,10,000</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <td style={{ padding: '8px 12px' }}>2.</td>
                  <td style={{ padding: '8px 12px' }}>Computing Laboratories &amp; Workshop Fee</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹ 8,500</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹ 17,000</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <td style={{ padding: '8px 12px' }}>3.</td>
                  <td style={{ padding: '8px 12px' }}>Central Digital Library &amp; Journal Repository</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹ 3,000</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹ 6,000</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <td style={{ padding: '8px 12px' }}>4.</td>
                  <td style={{ padding: '8px 12px' }}>Student Welfare, Sports &amp; Development Fund</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹ 4,500</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹ 9,000</td>
                </tr>
                <tr style={{ background: 'rgba(37, 99, 235, 0.15)', fontWeight: 800 }}>
                  <td colSpan={2} style={{ padding: '10px 12px', color: '#f8fafc' }}>
                    Total Institutional Fee Payable:
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#60a5fa' }}>₹ 71,000</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#34d399' }}>₹ 1,42,000</td>
                </tr>
              </tbody>
            </table>

            <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Note: The fee is verified by the Finance Department for the purpose of:{' '}
              <strong style={{ color: '#fbbf24' }}>{purpose}</strong>.
            </p>
          </div>
        )}

        {/* Document Body Variant 3: No Dues */}
        {certType === 'no_dues' && (
          <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#e2e8f0', marginBottom: '32px' }}>
            <p>
              This is to certify that there are <strong>NO OUTSTANDING DUES OR LIABILITIES</strong> against{' '}
              <strong>{student.studentName}</strong> (Roll: {student.rollNumber}) across any administrative,
              academic, or residential units of JIS University as of 03 November 2026:
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
                margin: '18px 0',
              }}
            >
              {[
                { department: 'Department of Computer Science & Engineering', clearance: 'CLEARED · 0 DUES', officer: 'HoD / Lab In-Charge' },
                { department: 'Central Library & Digital Resource Center', clearance: 'CLEARED · 0 HOLDS', officer: 'Chief Librarian' },
                { department: 'Finance, Accounts & Cash Section', clearance: 'CLEARED · 100% PAID', officer: 'Finance Officer' },
                { department: 'Hostel Administration & Mess Office', clearance: 'CLEARED · NO ARREARS', officer: 'Hostel Warden' },
                { department: 'Sports Board & Student Gymkhana', clearance: 'CLEARED · NO GEAR DUE', officer: 'Sports Director' },
                { department: 'Training, Placement & Internship Cell', clearance: 'VERIFIED · ELIGIBLE', officer: 'TPO Officer' },
              ].map((d) => (
                <div
                  key={d.department}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: 'rgba(20, 26, 44, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontWeight: 800, fontSize: '0.8rem' }}>
                    <CheckCircle2 size={14} />
                    <span>{d.clearance}</span>
                  </div>
                  <strong style={{ display: 'block', fontSize: '0.825rem', color: '#f8fafc', marginTop: '2px' }}>
                    {d.department}
                  </strong>
                  <span style={{ fontSize: '0.725rem', color: '#94a3b8' }}>Sign-off: {d.officer}</span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Institutional No-Dues clearance issued for purpose: <strong style={{ color: '#fbbf24' }}>{purpose}</strong>.
            </p>
          </div>
        )}

        {/* Footer Attestation & Seal Grid */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingTop: '20px',
            borderTop: '2px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          {/* Digital QR Attestation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '72px',
                height: '72px',
                background: '#ffffff',
                borderRadius: '10px',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <QrCode size={64} color="#0a1128" />
            </div>
            <div style={{ fontSize: '0.725rem', color: '#94a3b8', maxWidth: '240px' }}>
              <div style={{ color: '#34d399', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={13} />
                <span>CRYPTOGRAPHICALLY SEALED</span>
              </div>
              <div>Digital Attestation Hash:</div>
              <code style={{ color: '#60a5fa', fontSize: '0.7rem' }}>SHA256:7f8e...983c-JISU</code>
            </div>
          </div>

          {/* Registrar Signature */}
          <div style={{ textAlign: 'center', minWidth: '200px' }}>
            <div
              style={{
                height: '42px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'cursive',
                fontSize: '1.25rem',
                color: '#93c5fd',
              }}
            >
              Dr. Sandip Ghosh
            </div>
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.2)', paddingTop: '4px' }}>
              <strong style={{ fontSize: '0.85rem', color: '#f8fafc', display: 'block' }}>
                Registrar
              </strong>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>JIS University, Kolkata</span>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

export default CertificateGenerator;
