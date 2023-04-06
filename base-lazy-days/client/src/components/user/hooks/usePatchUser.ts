import jsonpatch from 'fast-json-patch';
import { UseMutateFunction, useMutation, useQueryClient } from 'react-query';

import type { User } from '../../../../../shared/types';
import { axiosInstance, getJWTHeader } from '../../../axiosInstance';
import { queryKeys } from '../../../react-query/constants';
import { useCustomToast } from '../../app/hooks/useCustomToast';
import { useUser } from './useUser';

// for when we need a server function
async function patchUserOnServer(
  newData: User | null,
  originalData: User | null,
): Promise<User | null> {
  if (!newData || !originalData) return null;
  // create a patch for the difference between newData and originalData
  const patch = jsonpatch.compare(originalData, newData);

  // send patched data to the server
  const { data } = await axiosInstance.patch(
    `/user/${originalData.id}`,
    { patch },
    {
      headers: getJWTHeader(originalData),
    },
  );
  return data.user;
}

export function usePatchUser(): UseMutateFunction<
  User,
  unknown,
  User,
  unknown
> {
  const { user, updateUser } = useUser();
  const toast = useCustomToast();
  const queryClient = useQueryClient();

  const { mutate: patchUser } = useMutation(
    (newUserData: User) => patchUserOnServer(newUserData, user),
    {
      // onMutate는 onError에 전달되는 컨텍스트를 반환합니다.
      onMutate: async (newData: User | null) => {
        // 사용자 데이터에 대한 모든 요청을 취소하여 이전 서버 데이터가
        // optimistic update를 덮어쓰지 않도록합니다.
        queryClient.cancelQueries(queryKeys.user);

        // 이전 사용자 값의 스냅샷을 가져오고,
        const previousUserData: User = queryClient.getQueryData(queryKeys.user);

        // 새 사용자 값으로 optimistic update를 캐시에 업데이트합니다.
        updateUser(newData);

        // 스냅샷 된 값을 포함하는 컨텍스트 객체를 반환합니다.
        return { previousUserData };
      },
      onError: (error, newData, context) => {
        // 캐시를 저장된 값으로 롤백합니다
        if (context.previousUserData) {
          updateUser(context.previousUserData);
          toast({
            title: 'Update failed; restoring previous values',
            status: 'warning',
          });
        }
      },
      onSuccess: (userData: User | null) => {
        if (user) {
          updateUser(userData);
          toast({
            title: 'User updated!',
            status: 'success',
          });
        }
      },
      onSettled: () => {
        // 사용자 쿼리를 무효화하여 서버 데이터와 동기화되는지 확인합니다
        queryClient.invalidateQueries(queryKeys.user);
      },
    },
  );

  return patchUser;
}
