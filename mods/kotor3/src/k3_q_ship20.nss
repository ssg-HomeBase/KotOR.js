// k3_q_ship20.nss: Hesk sells the Far Lantern: A Ship That Will Not Turn Back, stage 20.
// Original code for this fan project (KOTOR III (fan), Phase 2 episode). See docs/EPISODE1.md.
#include "k3_inc_main"

void main()
{
    K3Quest("k3_ship", 20);
    SetGlobalBoolean("K3_SHIP_PAID", TRUE);
}
