import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface AcademicRecord {
  readonly rollNumber: string;
  readonly studentName: string;
  readonly degree: string;
  readonly department: string;
  readonly batch: string;
  readonly currentSemester: number;
  readonly cgpa: number;
  readonly creditsCompleted: number;
  readonly hostelBlock: string;
  readonly roomNumber: string;
  readonly erpSyncTime: string;
}

export interface StudentProfile {
  readonly academic: AcademicRecord;
  readonly interests: readonly string[];
  readonly skills: readonly string[];
  readonly careerGoal: string;
  readonly incomeBracket: string;
  readonly dpdpConsentGranted: boolean;
  readonly completenessPercent: number;
  readonly missingFields: readonly string[];
}

const DEFAULT_PROFILE: StudentProfile = {
  academic: {
    rollNumber: '2024BCSE042',
    studentName: 'Ananya Das',
    degree: 'Bachelor of Technology (B.Tech)',
    department: 'Computer Science and Engineering',
    batch: '2024 - 2028',
    currentSemester: 4,
    cgpa: 8.42,
    creditsCompleted: 78,
    hostelBlock: 'Mandakini Hall of Residence (Block B)',
    roomNumber: 'B-204',
    erpSyncTime: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  interests: [
    'Algorithms & Data Structures',
    'Distributed Systems',
    'Artificial Intelligence',
    'Open Source Contribution',
    'Technical Writing',
  ],
  skills: ['TypeScript', 'Python', 'C++', 'React', 'SQL', 'Git & Linux'],
  careerGoal: 'Higher Studies & Research Fellowship',
  incomeBracket: 'bracket_2_5_to_6',
  dpdpConsentGranted: true,
  completenessPercent: 84,
  missingFields: ['Resume / Portfolio PDF upload in Locker', 'Faculty Mentor verification'],
};

const PROFILE_KEY = 'campusconnect:student_profile';

function loadProfile(): StudentProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return DEFAULT_PROFILE;
}

export function useStudentProfile() {
  return useQuery<StudentProfile>({
    queryKey: ['student', 'profile'],
    queryFn: async () => {
      return loadProfile();
    },
  });
}

export function useUpdateStudentProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updated: Partial<StudentProfile>) => {
      const current = loadProfile();
      const next: StudentProfile = {
        ...current,
        ...updated,
        completenessPercent: updated.interests && updated.interests.length > 5 ? 92 : current.completenessPercent,
      };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      return next;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['student', 'profile'], data);
    },
  });
}

