// k3_c_svjoin.nss: condition: Seren has joined the party.
// Original code for this fan project (KOTOR III (fan), Phase 2 episode). See docs/EPISODE1.md.
#include "k3_inc_main"

int StartingConditional()
{
    return GetGlobalBoolean("K3_SEREN_JOINED");
}
