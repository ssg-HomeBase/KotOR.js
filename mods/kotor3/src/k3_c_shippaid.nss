// k3_c_shippaid.nss: condition: the ship is paid for.
// Original code for this fan project (KOTOR III (fan), Phase 2 episode). See docs/EPISODE1.md.
#include "k3_inc_main"

int StartingConditional()
{
    return GetGlobalBoolean("K3_SHIP_PAID");
}
