import { Cell, controlClass, DataTable, PageHeader, Panel, Row, when } from "@/components/admin/console-ui";
import { CreateStaffForm } from "@/components/admin/create-staff-form";
import { StaffForm, StaffSubmit } from "@/components/admin/staff-form";
import { Badge } from "@/components/ui/badge";
import { setStaffEnabledAction, setStaffRoleAction } from "@/lib/admin/console-actions";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Staff" };

const ROLE_LABEL = { MODERATOR: "Moderator", ADMIN: "Admin", SUPER_ADMIN: "Super admin" } as const;

/**
 * Spec §7 Staff (SUPER_ADMIN only): separate email accounts with an authenticator app (TOTP).
 * Create, change role, turn off and on — each audited. You can't change your own account here.
 */
export default async function StaffPage() {
  const me = await requireStaff("SUPER_ADMIN");
  const { data, error } = await (await createClient()).rpc("staff_list");
  const rows = data ?? [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff"
        subtitle="Separate staff accounts · authenticator app required · changes are audit-logged"
      />
      <Panel title="Add a staff member">
        <CreateStaffForm />
      </Panel>
      {error ? <p role="alert">The list couldn’t load. Refresh to try again.</p> : null}
      <DataTable
        label="Staff accounts"
        head={["Email", "Role", "Authenticator", "Status", "Last sign-in", "Actions"]}
        empty={rows.length === 0}
      >
        {rows.map((s) => {
          const self = s.user_id === me.id;
          const enabled = s.status !== "BANNED";
          return (
            <Row key={s.user_id}>
              <Cell>
                {s.email}
                {self ? <span className="ml-2 text-sm text-muted-foreground">(you)</span> : null}
              </Cell>
              <Cell>{s.role === "USER" ? "—" : ROLE_LABEL[s.role]}</Cell>
              <Cell>{s.mfa ? <Badge tone="approved">Set up</Badge> : <Badge tone="pending">Not yet</Badge>}</Cell>
              <Cell>{enabled ? "On" : <span className="text-danger">Off</span>}</Cell>
              <Cell className="whitespace-nowrap">{when(s.last_sign_in_at)}</Cell>
              <Cell>
                {self ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap items-start gap-3">
                    <StaffForm
                      action={setStaffRoleAction}
                      label={`Change role for ${s.email}`}
                      className="flex-row flex-wrap"
                    >
                      <input type="hidden" name="userId" value={s.user_id} />
                      <select
                        name="role"
                        defaultValue={s.role}
                        aria-label={`Role for ${s.email}`}
                        className={controlClass}
                      >
                        <option value="MODERATOR">Moderator</option>
                        <option value="ADMIN">Admin</option>
                        <option value="SUPER_ADMIN">Super admin</option>
                      </select>
                      <StaffSubmit variant="outline">Change role</StaffSubmit>
                    </StaffForm>
                    <StaffForm action={setStaffEnabledAction} label={`${enabled ? "Turn off" : "Turn on"} ${s.email}`}>
                      <input type="hidden" name="userId" value={s.user_id} />
                      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
                      <StaffSubmit variant={enabled ? "danger" : "secondary"}>
                        {enabled ? "Turn off" : "Turn on"}
                      </StaffSubmit>
                    </StaffForm>
                  </div>
                )}
              </Cell>
            </Row>
          );
        })}
      </DataTable>
    </div>
  );
}
