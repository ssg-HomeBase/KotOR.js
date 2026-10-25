// k3_c_metsv.nss: condition: the player met Seren but she has not joined (the 'you came back' opening).
// Original code for this fan project (KOTOR III (fan), Phase 2 episode). See docs/EPISODE1.md.
#include "k3_inc_main"

int StartingConditional()
{
    return GetGlobalBoolean("K3_MET_SEREN") && !GetGlobalBoolean("K3_SEREN_JOINED");
}
