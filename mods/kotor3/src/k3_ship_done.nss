// k3_ship_done.nss: the ship is ready: A Ship That Will Not Turn Back, stage 30; then the final scene.
// Original code for this fan project (KOTOR III (fan), Phase 2 episode). See docs/EPISODE1.md.
#include "k3_inc_main"

void main()
{
    K3Quest("k3_ship", 30);
    DelayCommand(1.0, K3SerenTalksWhenFree("k3_end"));
}
