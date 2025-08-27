// Super temp. remove when done with skills
const skillsWithDetails = {
    "abyss_knight": true,
    "ancients_hand": true,
    "angel_of_death": true,
    "apocalypse": true,
    "antimass": true,
    "arcane_swarm": true,
    "arcane_torrent": true,
    "arrow_swarm": true,
    "atmg_sentry": true,
    "avalanche": true,
    "balefire": true,
    "bane": true,
    "banish": true,
    "barrage": true,
    "bend_the_shadows": true,
    "black_lotus_strike": true,
    "bladestorm": true,
    "blink": true,
    "bloodstar": true,
    "bloodstorm": true,
    "blood_fury": true,
    "chaos_nova": true,
    "deathgaze": true,
    "death_pact": true,
    "devouring_cloud": true,
    "earthquake": true,
    "famine": true,
    "mind_control": true,
    "orb_of_annihilation": true,
    "remorseless_winter": true,
    "resurgence": true,
    "sacrifices": true,
    "scepter_mastery": true,
    "town_portal": true,
    "treewarden_morph": true
}

let showDetailedOnly = false;

$.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
    if (!showDetailedOnly) return true;

    const row = settings.aoData[dataIndex].nTr;
    return $(row).attr("data-has-page") === "true";
});