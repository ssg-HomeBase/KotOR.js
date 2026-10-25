// k3_probe.nss
// KOTOR III (fan), milestone M1.4: probe script for the in-game test.
// Seren runs it on her line after the player agrees to go (k3_seren.dialogue.json, entry E5).
// It gives the player 77 credits, an amount nothing else in the scene gives, so a test can
// read the party's credits before and after the conversation and look for exactly +77.
// Engine routines used: GetFirstPC (548) and GiveGoldToCreature (322).
// Original code for this fan project.

void main()
{
    object oPC = GetFirstPC();
    GiveGoldToCreature(oPC, 77);
}
