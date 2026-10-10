import { StaffForm, StaffSubmit } from "@/components/admin/staff-form";
import { banUserAction, restoreUserAction, suspendUserAction, unhideMemberAction } from "@/lib/admin/report-actions";
import { BAN_REASON_KEYS, BAN_REASONS, SUSPENSION_DAYS } from "@/lib/safety/categories";
import { cn } from "@/lib/utils";

const select = "min-h-11 rounded-control border-[1.5px] border-border bg-background px-3 text-[15px]";

/**
 * Account actions on a reported or flagged member (spec §7, §21): moderators unhide and suspend
 * (suspensions only get longer); admins ban and lift. The database re-checks every rule and audits.
 */
function MemberActions({
  userId,
  reportId,
  storedStatus,
  suspendedUntil,
  hiddenReason,
  isAdmin,
}: {
  userId: string;
  reportId?: string;
  storedStatus: string;
  suspendedUntil: string | null;
  hiddenReason: string | null;
  isAdmin: boolean;
}) {
  const canSuspend = storedStatus === "PENDING" || storedStatus === "ACTIVE";
  // Q54: an account deleted before its reports were decided can still be banned (phone blocklist).
  const canBan =
    storedStatus === "PENDING" ||
    storedStatus === "ACTIVE" ||
    storedStatus === "SUSPENDED" ||
    storedStatus === "DELETED";
  return (
    <div className="flex flex-col gap-4">
      {hiddenReason ? (
        <StaffForm action={unhideMemberAction} label="Make visible">
          <input type="hidden" name="userId" value={userId} />
          <StaffSubmit variant="secondary">Make the member visible again</StaffSubmit>
        </StaffForm>
      ) : null}

      {canSuspend ? (
        <StaffForm action={suspendUserAction} label="Suspend">
          <input type="hidden" name="userId" value={userId} />
          {reportId ? <input type="hidden" name="reportId" value={reportId} /> : null}
          <div className="flex gap-3">
            <select name="days" aria-label="Suspension length" className={cn(select, "flex-1")} defaultValue="7">
              {SUSPENSION_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d} day{d === 1 ? "" : "s"}
                </option>
              ))}
            </select>
            <StaffSubmit variant="outline">Suspend</StaffSubmit>
          </div>
        </StaffForm>
      ) : null}

      {isAdmin && canBan ? (
        <StaffForm action={banUserAction} label="Ban">
          <input type="hidden" name="userId" value={userId} />
          {reportId ? <input type="hidden" name="reportId" value={reportId} /> : null}
          <div className="flex gap-3">
            <select name="reason" aria-label="Ban reason" className={cn(select, "flex-1")} defaultValue="">
              <option value="">Ban reason…</option>
              {BAN_REASON_KEYS.map((k) => (
                <option key={k} value={k}>
                  {BAN_REASONS[k]}
                </option>
              ))}
            </select>
            <StaffSubmit variant="danger">Ban</StaffSubmit>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" name="confirm" className="size-5 accent-danger" />
            Ends their sessions and stops this phone number signing up again
          </label>
        </StaffForm>
      ) : null}

      {isAdmin && (storedStatus === "BANNED" || suspendedUntil) ? (
        <StaffForm action={restoreUserAction} label="Restore">
          <input type="hidden" name="userId" value={userId} />
          <StaffSubmit variant="secondary">{storedStatus === "BANNED" ? "Lift ban" : "Lift suspension"}</StaffSubmit>
        </StaffForm>
      ) : null}
      {!isAdmin ? <p className="text-sm text-muted-foreground">Bans and lifting a suspension are for admins.</p> : null}
    </div>
  );
}

export { MemberActions };
