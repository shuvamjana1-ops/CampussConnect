import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export type OpportunityType = 'Scholarship' | 'Internship' | 'ResearchGrant' | 'Fellowship';

export interface MatchCriteria {
  readonly label: string;
  readonly studentValue: string;
  readonly requiredValue: string;
  readonly matched: boolean;
}

export interface RequiredDocument {
  readonly id: string;
  readonly title: string;
  readonly lockerStatus: 'verified' | 'uploaded' | 'missing';
  readonly required: boolean;
}

export interface Opportunity {
  readonly id: string;
  readonly title: string;
  readonly provider: string;
  readonly type: OpportunityType;
  readonly awardText: string;
  readonly deadline: string;
  readonly daysRemaining: number;
  readonly matchScore: number; // 0-100
  readonly description: string;
  readonly eligibilitySummary: string;
  readonly criteria: readonly MatchCriteria[];
  readonly requiredDocuments: readonly RequiredDocument[];
  readonly externalUrl: string;
  readonly isSaved: boolean;
  readonly applicationStatus?: 'Saved' | 'Preparing' | 'Submitted' | 'Awarded' | 'NotSelected' | undefined;
}

const SEED_OPPORTUNITIES: readonly Opportunity[] = [
  {
    id: 'opp_merit_means_2026',
    title: 'Central Sector Merit-cum-Means Scholarship 2026',
    provider: 'Ministry of Education / National Scholarship Portal',
    type: 'Scholarship',
    awardText: '₹50,000 / academic year + Tuition waiver',
    deadline: new Date(Date.now() + 86400000 * 12).toISOString(),
    daysRemaining: 12,
    matchScore: 96,
    description: 'Financial assistance for meritorious undergraduate students enrolled in technical and professional courses with family income below ₹8.0 LPA.',
    eligibilitySummary: 'Degree: B.Tech (All Branches) · Min CGPA 7.5 · Family Annual Income < ₹8,00,000',
    criteria: [
      { label: 'Degree Programme', studentValue: 'B.Tech Computer Science & Engg', requiredValue: 'B.Tech / B.E. (Accredited)', matched: true },
      { label: 'Current Semester / Year', studentValue: '2nd Year (Semester 4)', requiredValue: '1st - 4th Year', matched: true },
      { label: 'Academic Standing', studentValue: '8.42 CGPA', requiredValue: 'Minimum 7.50 CGPA', matched: true },
      { label: 'Income Bracket', studentValue: '₹2.5L - ₹6.0L / year', requiredValue: 'Below ₹8.00 Lakhs / year', matched: true },
      { label: 'Nationality', studentValue: 'Indian Citizen', requiredValue: 'Indian Citizen', matched: true },
    ],
    requiredDocuments: [
      { id: 'doc_1', title: '10th & 12th Verified Board Marksheets', lockerStatus: 'verified', required: true },
      { id: 'doc_2', title: 'Institutional Bonafide Student Certificate', lockerStatus: 'verified', required: true },
      { id: 'doc_3', title: 'Competent Authority Income Certificate (FY 2025-26)', lockerStatus: 'uploaded', required: true },
      { id: 'doc_4', title: 'Bank Account Passbook / Mandate Form', lockerStatus: 'verified', required: true },
    ],
    externalUrl: 'https://scholarships.gov.in',
    isSaved: true,
    applicationStatus: 'Preparing',
  },
  {
    id: 'opp_aicte_pragati_2026',
    title: 'AICTE Pragati Scholarship for Women in Engineering',
    provider: 'All India Council for Technical Education (AICTE)',
    type: 'Scholarship',
    awardText: '₹50,000 / year towards education & hostel expenses',
    deadline: new Date(Date.now() + 86400000 * 18).toISOString(),
    daysRemaining: 18,
    matchScore: 94,
    description: 'Empowering girl students pursuing technical degree programmes in AICTE approved institutions with direct bank transfer support.',
    eligibilitySummary: 'Female candidates · Admitted to 1st/2nd year degree · Income < ₹8 Lakhs',
    criteria: [
      { label: 'Gender Requirement', studentValue: 'Female', requiredValue: 'Female candidate', matched: true },
      { label: 'Enrolled Degree', studentValue: 'B.Tech CSE (AICTE Approved)', requiredValue: 'Degree course in Technical Institution', matched: true },
      { label: 'Current Year', studentValue: '2nd Year (Lateral / Regular)', requiredValue: '1st or 2nd Year', matched: true },
      { label: 'Family Income', studentValue: '₹2.5L - ₹6.0L', requiredValue: 'Max ₹8.0 LPA', matched: true },
    ],
    requiredDocuments: [
      { id: 'doc_p1', title: 'Admission Allotment Letter', lockerStatus: 'verified', required: true },
      { id: 'doc_p2', title: 'Tuition Fee Receipt for Current Semester', lockerStatus: 'verified', required: true },
      { id: 'doc_p3', title: 'Affidavit of Not Availing Double Central Scholarship', lockerStatus: 'missing', required: true },
    ],
    externalUrl: 'https://www.aicte-india.org',
    isSaved: false,
    applicationStatus: 'Saved',
  },
  {
    id: 'opp_isro_summer_2026',
    title: 'ISRO Space Applications Summer Research Internship',
    provider: 'Indian Space Research Organisation (ISRO)',
    type: 'Internship',
    awardText: '₹20,000 / month stipend + Campus Accommodation',
    deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
    daysRemaining: 7,
    matchScore: 89,
    description: 'Two-month summer research project at Space Applications Centre (SAC) on satellite telemetry data systems and distributed algorithms.',
    eligibilitySummary: 'B.Tech Pre-final / 2nd year · CGPA >= 8.0 · CSE/ECE/EE departments',
    criteria: [
      { label: 'Academic Standing', studentValue: '8.42 CGPA', requiredValue: 'CGPA >= 8.0', matched: true },
      { label: 'Eligible Branch', studentValue: 'Computer Science', requiredValue: 'CSE / IT / ECE', matched: true },
      { label: 'No Active Backlogs', studentValue: '0 Backlogs', requiredValue: 'Nil arrears', matched: true },
    ],
    requiredDocuments: [
      { id: 'doc_i1', title: 'No Objection Certificate (NOC) from Dean', lockerStatus: 'verified', required: true },
      { id: 'doc_i2', title: 'Curriculum Vitae / GitHub Portfolio', lockerStatus: 'uploaded', required: true },
      { id: 'doc_i3', title: 'Statement of Research Interest (1 Page)', lockerStatus: 'missing', required: true },
    ],
    externalUrl: 'https://www.isro.gov.in/careers',
    isSaved: true,
    applicationStatus: 'Preparing',
  },
  {
    id: 'opp_google_generation_2026',
    title: 'Google Generation Scholarship (APAC) - Women in Tech',
    provider: 'Google Education Foundation',
    type: 'Scholarship',
    awardText: 'USD $2,500 (~₹2,10,000) award + Mentorship',
    deadline: new Date(Date.now() + 86400000 * 25).toISOString(),
    daysRemaining: 25,
    matchScore: 91,
    description: 'Awarded based on academic background, demonstrated passion for computer science, and leadership in diversity in STEM.',
    eligibilitySummary: 'Undergraduate student in CS · Exemplary academic and leadership track record',
    criteria: [
      { label: 'Field of Study', studentValue: 'Computer Science', requiredValue: 'Computer Science / related STEM field', matched: true },
      { label: 'Enrolled Full-Time', studentValue: 'Full-time B.Tech', requiredValue: 'Full-time student at accredited university', matched: true },
      { label: 'Diversity & Community', studentValue: 'Open Source Contributor / Tutor', requiredValue: 'Demonstrated passion for tech', matched: true },
    ],
    requiredDocuments: [
      { id: 'doc_g1', title: 'Current Semester Academic Transcript', lockerStatus: 'verified', required: true },
      { id: 'doc_g2', title: 'Essay Responses (Leadership & Diversity)', lockerStatus: 'uploaded', required: true },
      { id: 'doc_g3', title: 'Letter of Recommendation from Faculty', lockerStatus: 'missing', required: true },
    ],
    externalUrl: 'https://buildyourfuture.withgoogle.com',
    isSaved: false,
    applicationStatus: undefined,
  },
  {
    id: 'opp_drdo_undergrad_2026',
    title: 'DRDO Center for Artificial Intelligence & Robotics Trainee',
    provider: 'Defense Research & Development Organisation',
    type: 'Internship',
    awardText: '₹18,000 / month stipend',
    deadline: new Date(Date.now() + 86400000 * 30).toISOString(),
    daysRemaining: 30,
    matchScore: 85,
    description: 'Work alongside scientist mentors on secure distributed messaging, anomaly detection, and robust edge computing models.',
    eligibilitySummary: 'B.Tech 2nd/3rd Year · Solid foundations in Algorithms & Systems',
    criteria: [
      { label: 'Department', studentValue: 'Computer Science', requiredValue: 'CSE / ECE', matched: true },
      { label: 'Minimum CGPA', studentValue: '8.42 CGPA', requiredValue: 'Minimum 7.80 CGPA', matched: true },
    ],
    requiredDocuments: [
      { id: 'doc_d1', title: 'Head of Department Recommendation', lockerStatus: 'verified', required: true },
      { id: 'doc_d2', title: 'Institutional Photo ID Card', lockerStatus: 'verified', required: true },
    ],
    externalUrl: 'https://www.drdo.gov.in',
    isSaved: false,
    applicationStatus: undefined,
  },
];

const LOCAL_KEY = 'campusconnect:saved_opportunities';

function getSavedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed)
      ? new Set(parsed.filter((item): item is string => typeof item === 'string'))
      : new Set(['opp_merit_means_2026', 'opp_isro_summer_2026']);
  } catch {
    return new Set(['opp_merit_means_2026', 'opp_isro_summer_2026']);
  }
}

function saveIds(ids: Set<string>): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify([...ids]));
}

export function useOpportunities() {
  return useQuery<readonly Opportunity[]>({
    queryKey: ['student', 'opportunities'],
    queryFn: () => {
      const saved = getSavedIds();
      return SEED_OPPORTUNITIES.map((opp) => ({
        ...opp,
        isSaved: saved.has(opp.id),
      }));
    },
    staleTime: 60_000,
  });
}

export function useToggleSaveOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<string> => {
      const saved = getSavedIds();
      if (saved.has(id)) {
        saved.delete(id);
      } else {
        saved.add(id);
      }
      saveIds(saved);
      return Promise.resolve(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['student', 'opportunities'] });
    },
  });
}
