// k3_nar_enter.nss: the mod's area-enter script for 301nar (manifest onEnter): Seren's arrival talk, once.
// Original code for this fan project (KOTOR III (fan), Phase 2 episode). See docs/EPISODE1.md.
#include "k3_inc_main"

void main()
{
    if (GetGlobalBoolean("K3_SEREN_JOINED") && !GetGlobalBoolean("K3_NAR_ARRIVED")) {
        SetGlobalBoolean("K3_NAR_ARRIVED", TRUE);
        DelayCommand(2.0, K3SerenTalksWhenFree("k3_sv_nar"));
    }
}
