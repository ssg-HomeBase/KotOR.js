// k3_go_nar.nss: Lieutenant Senn clears the shuttle: The Last Signal, stage 30, and travel to Nar Shaddaa (301nar).
// Original code for this fan project (KOTOR III (fan), Phase 2 episode). See docs/EPISODE1.md.
#include "k3_inc_main"

void main()
{
    K3Quest("k3_signal", 30);
    SetGlobalBoolean("K3_CLEARANCE", TRUE);
    StartNewModule("301nar", "", "", "", "", "", "", "");
}
