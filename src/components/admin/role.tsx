'use client';

import { createContext, useContext } from 'react';

/** Роль в админке: admin — полный доступ, viewer — только просмотр (кнопки изменений скрыты; настоящая защита — на сервере: RLS, RPC и edge-функции пускают только is_admin()). */
export type AdminRole = 'admin' | 'viewer';

export const RoleContext = createContext<AdminRole>('admin');

export const useReadOnly = () => useContext(RoleContext) === 'viewer';
