// k3_c_nav20.nss: condition: the player has heard about the Mandalorian scout (navigator stage 20 or more).
// Original code for this fan project (KOTOR III (fan), Phase 2 episode). See docs/EPISODE1.md.
#include "k3_inc_main"

int StartingConditional()
{
    return GetJournalEntry("k3_navigator") >= 20;
}
