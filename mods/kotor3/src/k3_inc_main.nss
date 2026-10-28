// k3_inc_main.nss: shared helpers for the KOTOR III (fan) episode scripts (include only).
// Original code for this fan project (KOTOR III (fan), Phase 2 episode). See docs/EPISODE1.md.
// Party slots reuse KOTOR II's own slots; neither base-game companion appears in this episode.
int K3SlotSeren() { return 4; }
int K3SlotRhea() { return 2; }

// Advance a mod quest (never lowers a stage).
void K3Quest(string sTag, int nState)
{
    AddJournalQuestEntry(sTag, nState, FALSE);
}

// Make a placed mod character a party member and remember it in a mod global.
void K3Join(int nSlot, string sTag, string sGlobal)
{
    object oNPC = GetObjectByTag(sTag, 0);
    AddAvailableNPCByTemplate(nSlot, sTag);
    if (GetIsObjectValid(oNPC)) {
        AddPartyMember(nSlot, oNPC);
    }
    SetGlobalBoolean(sGlobal, TRUE);
}

// Have Seren (a party member) start one of the mod's conversations with the player.
void K3SerenTalks(string sDialog)
{
    object oSeren = GetObjectByTag("k3_seren", 0);
    AssignCommand(oSeren, ActionStartConversation(GetFirstPC(), sDialog, FALSE, 0, TRUE, "", "", "", "", "", "", FALSE, 0, 0, FALSE));
}

// Start one of Seren's conversations once no other conversation is on screen (checks once a second).
void K3SerenTalksWhenFree(string sDialog)
{
    if (GetIsConversationActive()) {
        DelayCommand(1.0, K3SerenTalksWhenFree(sDialog));
    } else {
        K3SerenTalks(sDialog);
    }
}
