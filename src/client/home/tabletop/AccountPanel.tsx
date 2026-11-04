import type { RefObject } from "react";
import { IdentityGate } from "../../IdentityGate.tsx";
import { AccountPage } from "../../lobby/Account.tsx";
import type { Account } from "../../state/api.ts";
import { TablePanel } from "./TablePanel.tsx";

// The sign's panel (ADR 0014): the existing account flow, unchanged, framed
// as the sign's nameplate in the same panel every table entrance uses.
// Mounting it is the first identity-dependent act on the homepage, so it
// goes through the same IdentityGate the lobby uses.

export function AccountPanel({ onClose, onAccountChange, returnFocus, signedIn }: { onClose: () => void; onAccountChange: (a: Account | null) => void; returnFocus: RefObject<HTMLElement | null>; signedIn: boolean }) {
  return (
    <TablePanel id="account-panel" title="Your nameplate" onClose={onClose} returnFocus={returnFocus}>
      {/* the guest card below already explains guest building and accounts once */}
      {signedIn && <p className="table-panel-lede">Your rooms, friends and collection follow you to any device you sign in on.</p>}
      <div className="account-scope">
        <IdentityGate>
          <AccountPage onAccountChange={onAccountChange} />
        </IdentityGate>
      </div>
    </TablePanel>
  );
}
