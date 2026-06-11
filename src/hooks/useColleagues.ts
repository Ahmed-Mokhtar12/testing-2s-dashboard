import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getColleagues } from '@/services/sharepoint';
import type { Colleague } from '@/types/hotel-training';

export function useColleagues() {
  const { session } = useAuth();
  const token = session?.provider_token ?? '';

  return useQuery<Colleague[], Error>({
    queryKey: ['colleagues', token],
    queryFn: () => getColleagues(token),
    staleTime: 5 * 60 * 1000,
    enabled: !!token,
  });
}
