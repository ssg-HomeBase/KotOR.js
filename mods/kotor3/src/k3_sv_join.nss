// k3_sv_join.nss: Seren joins the party; The Last Signal, stage 20.
// Original code for this fan project (KOTOR III (fan), Phase 2 episode). See docs/EPISODE1.md.
#include "k3_inc_main"

void main()
{
    K3Join(K3SlotSeren(), "k3_seren", "K3_SEREN_JOINED");
    K3Quest("k3_signal", 20);
}
