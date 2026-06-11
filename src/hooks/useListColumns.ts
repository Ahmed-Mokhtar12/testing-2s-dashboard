import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getListColumns, type ListColumnsResult } from '@/services/sharepoint';

export function useListColumns() {
  const { session } = useAuth();
  const token = session?.provider_token ?? '';

  return useQuery<ListColumnsResult, Error>({
    queryKey: ['listColumns', token],
    queryFn: () => getListColumns(token),
    staleTime: 30 * 60 * 1000,
    enabled: !!token,
  });
}
