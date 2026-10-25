// k3_c_ready.nss: condition: ship paid, Rhea joined and Corva met (Hesk's ready opening).
// Original code for this fan project (KOTOR III (fan), Phase 2 episode). See docs/EPISODE1.md.
#include "k3_inc_main"

int StartingConditional()
{
    return GetGlobalBoolean("K3_SHIP_PAID") && GetGlobalBoolean("K3_RHEA_JOINED") && GetGlobalBoolean("K3_CORVA_MET");
}
