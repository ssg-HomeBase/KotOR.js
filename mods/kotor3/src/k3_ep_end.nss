// k3_ep_end.nss: last line of the episode: The Last Signal, stage 50, episode done.
// Original code for this fan project (KOTOR III (fan), Phase 2 episode). See docs/EPISODE1.md.
#include "k3_inc_main"

void main()
{
    K3Quest("k3_signal", 50);
    SetGlobalBoolean("K3_EPISODE_DONE", TRUE);
}
