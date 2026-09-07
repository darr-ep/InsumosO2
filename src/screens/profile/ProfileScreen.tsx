import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, User } from "lucide-react";
import { toast } from "sonner";
import { ClientResponseError } from "pocketbase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";
import { UserAvatar } from "@/components/UserAvatar";
import { LoadingDialog } from "@/components/LoadingDialog";
import {
  changeOwnPassword,
  currentAuthUser,
  ownAvatarUrl,
  updateOwnProfile,
  type AuthUserRecord,
} from "@/data/auth.repo";
import { handleIfStaleSession } from "@/data/staleSession";
import {
  passwordChangeFormSchema,
  profileFormSchema,
  type PasswordChangeFormValues,
  type ProfileFormValues,
} from "@/domain/auth/profile";

/**
 * New gap-fill feature: Self-Service Profile Screen (business owner
 * request, post-Phase-5, not in the original SDD §35 phase breakdown). The
 * 6 real business accounts are created once by the superuser (§14) and,
 * until now, had no way for the person using them to fix their own name,
 * phone or password without asking for admin-panel access — this screen
 * closes that gap. See `pb_migrations/README.md`'s own gap-fill entry for
 * this feature for the full live-verified story. The avatar shown here is
 * read-only by explicit business owner decision: the photo the owner
 * assigns to an account is permanent, so this screen has no avatar-edit
 * capability at all.
 *
 * Two independent "Guardar" sections (this app's house style, see
 * `DashboardStats.tsx`'s tap-to-edit dialog / `CustomerDetailSheet.tsx`'s
 * edit form for the same "small, separate save actions over one giant
 * form" precedent) rather than one combined submit — name/phone and
 * password each save (and fail) independently.
 *
 * Redesign Round 2, Batch 1 (Header Pattern): reached from a secondary
 * screen, so this uses `AppHeader`'s `showBack` variant + the same
 * standalone (outside `AppLayout`, no bottom nav) root wrapper
 * `RentalNewScreen.tsx` already established for a non-primary destination.
 */
export function ProfileScreen() {
  const [user, setUser] = useState<AuthUserRecord | null>(() =>
    currentAuthUser(),
  );

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { name: user?.name ?? "", phone: user?.phone ?? "" },
  });

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordForm = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeFormSchema),
    defaultValues: { oldPassword: "", password: "", passwordConfirm: "" },
  });

  async function handleSaveProfile(values: ProfileFormValues) {
    setProfileError(null);
    setIsSavingProfile(true);

    try {
      const updated = await updateOwnProfile(values);
      setUser(updated);
      profileForm.reset(values);
      toast.success("Perfil actualizado.");
    } catch (error) {
      if (handleIfStaleSession(error)) {
        return;
      }
      // Live-verified (auth.repo.ts#updateOwnProfile docblock,
      // auth-profile.integration.test.ts): a duplicate `phone` fails with
      // this exact field-level shape, distinct from a generic save error.
      if (
        error instanceof ClientResponseError &&
        (error.response?.data as { phone?: { code?: string } } | undefined)
          ?.phone?.code === "validation_not_unique"
      ) {
        setProfileError("Ese teléfono ya está en uso por otra cuenta.");
      } else {
        setProfileError(
          "No se pudo guardar el cambio. Verifica tu conexión e intenta de nuevo.",
        );
      }
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleChangePassword(values: PasswordChangeFormValues) {
    setPasswordError(null);
    setIsChangingPassword(true);

    try {
      await changeOwnPassword(values);
      passwordForm.reset({ oldPassword: "", password: "", passwordConfirm: "" });
      toast.success("Contraseña actualizada.");
    } catch (error) {
      if (handleIfStaleSession(error)) {
        return;
      }
      // §14 gap-fill precedent (LoginScreen's own login-failure message):
      // never reveal whether the CURRENT password specifically was wrong
      // vs. some other failure — same "generic on purpose" principle.
      setPasswordError(
        "No se pudo cambiar la contraseña. Verifica tu contraseña actual e intenta de nuevo.",
      );
    } finally {
      setIsChangingPassword(false);
    }
  }

  if (!user) {
    // Unreachable in practice — this route sits behind `RequireAuth`
    // (App.tsx) — handled instead of assumed, same defensive shape
    // `currentAuthUser()` itself uses.
    return (
      <div className="mx-auto flex h-dvh w-full max-w-xl flex-col bg-background text-foreground overflow-hidden">
        <AppHeader title="Perfil" showBack />
        <main className="flex flex-1 flex-col items-center justify-center px-4">
          <p className="text-muted-foreground text-sm">
            No se pudo cargar tu perfil.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col bg-background text-foreground overflow-hidden">
      <AppHeader title="Perfil" showBack />

      <main className="flex flex-1 flex-col overflow-y-auto">
        <div className="flex flex-1 flex-col gap-6 px-4 pt-2 pb-8">
          <section className="flex flex-col items-center gap-2">
            <div className="rounded-full border-2 border-border bg-card p-0.5 overflow-hidden">
              <UserAvatar
                name={user.name}
                avatarUrl={ownAvatarUrl(user)}
                size={96}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3 pt-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <User aria-hidden="true" className="size-4 text-foreground" />
              Datos personales
            </h2>
            <form
              onSubmit={(event) =>
                void profileForm.handleSubmit(handleSaveProfile)(event)
              }
              className="flex flex-col gap-4"
              noValidate
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-name">Nombre</Label>
                <Input
                  id="profile-name"
                  autoComplete="name"
                  placeholder="Ej. Juan Pérez"
                  aria-invalid={!!profileForm.formState.errors.name}
                  {...profileForm.register("name")}
                />
                {profileForm.formState.errors.name && (
                  <p className="text-destructive text-sm">
                    {profileForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-phone">Teléfono</Label>
                <Input
                  id="profile-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="5512345678"
                  aria-invalid={!!profileForm.formState.errors.phone}
                  {...profileForm.register("phone")}
                />
                {profileForm.formState.errors.phone && (
                  <p className="text-destructive text-sm">
                    {profileForm.formState.errors.phone.message}
                  </p>
                )}
              </div>

              {profileError && (
                <p className="text-destructive text-sm">{profileError}</p>
              )}

              <Button type="submit" disabled={isSavingProfile}>
                Guardar
              </Button>
            </form>
          </section>

          <section className="flex flex-col gap-3 border-t pt-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Lock aria-hidden="true" className="size-4 text-foreground" />
              Cambiar contraseña
            </h2>
            <form
              onSubmit={(event) =>
                void passwordForm.handleSubmit(handleChangePassword)(event)
              }
              className="flex flex-col gap-4"
              noValidate
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-old-password">
                  Contraseña actual
                </Label>
                <Input
                  id="profile-old-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-invalid={!!passwordForm.formState.errors.oldPassword}
                  {...passwordForm.register("oldPassword")}
                />
                {passwordForm.formState.errors.oldPassword && (
                  <p className="text-destructive text-sm">
                    {passwordForm.formState.errors.oldPassword.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-new-password">Nueva contraseña</Label>
                <Input
                  id="profile-new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  aria-invalid={!!passwordForm.formState.errors.password}
                  {...passwordForm.register("password")}
                />
                {passwordForm.formState.errors.password && (
                  <p className="text-destructive text-sm">
                    {passwordForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-new-password-confirm">
                  Confirmar nueva contraseña
                </Label>
                <Input
                  id="profile-new-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  aria-invalid={!!passwordForm.formState.errors.passwordConfirm}
                  {...passwordForm.register("passwordConfirm")}
                />
                {passwordForm.formState.errors.passwordConfirm && (
                  <p className="text-destructive text-sm">
                    {passwordForm.formState.errors.passwordConfirm.message}
                  </p>
                )}
              </div>

              {passwordError && (
                <p className="text-destructive text-sm">{passwordError}</p>
              )}

              <Button type="submit" disabled={isChangingPassword}>
                Guardar
              </Button>
            </form>
          </section>
        </div>
      </main>

      <LoadingDialog
        open={isSavingProfile || isChangingPassword}
        title="Guardando cambios..."
        description="Estamos actualizando tu información."
      />
    </div>
  );
}
