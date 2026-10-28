// k3_rh_join.nss: Rhea Vex joins the party as navigator; A Navigator Past the Charts, stage 30.
// Original code for this fan project (KOTOR III (fan), Phase 2 episode). See docs/EPISODE1.md.
#include "k3_inc_main"

void main()
{
    K3Join(K3SlotRhea(), "k3_rhea", "K3_RHEA_JOINED");
    K3Quest("k3_navigator", 30);
}
