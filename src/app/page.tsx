// Halaman tunggal Serbabisa (constraint environment: route "/" saja yang terlihat user).
// Server-side auth gate: tanpa sesi → LoginScreen; wajib ganti password → ChangePasswordScreen;
// selain itu → AppShell (SPA hash-routing: #/app/*, #/admin/*).
import { getSessionUser } from "@/lib/auth";
import { toSessionUserDTO } from "@/lib/services/serializers";
import LoginScreen from "@/components/auth/login-screen";
import ChangePasswordScreen from "@/components/auth/change-password-screen";
import AppShell from "@/components/app/app-shell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) return <LoginScreen />;
  const dto = toSessionUserDTO(user);
  if (user.mustChangePassword) {
    return <ChangePasswordScreen user={dto} />;
  }
  return <AppShell initialUser={dto} />;
}
