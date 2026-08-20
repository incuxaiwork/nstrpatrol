package com.nstrpatrol.app.data

/**
 * Static reference/choice lists used as dropdown options across the data-entry
 * forms (species, beats, patrol methods, incident/action types, etc.).
 *
 * These are configuration/reference data, not sample records — the screen
 * content itself is sourced from the backend/DB.
 */
object Options {
    val patrolTypes = listOf("Combing_Surveillance", "General Duties")
    val patrolMethods = listOf(
        "Foot", "Motor Cycle", "Four Wheeler", "Boat", "Cycle", "Aerial", "Elephant", "Horse", "Camel"
    )
    val beats = listOf(
        "All", "Bommilingam", "Donakonda", "Gotlagattu", "Gottipadia", "Gundamcherla",
        "Kalanuthala", "Kalzuvvalapadu", "Magutur", "Nagulavaram", "Peddarikatla",
        "Podili", "Potlapadu"
    )
    val armTypes = listOf("Axe", "Bow and Arrow", "Fire Crackers", "Gun", "Knife", "Sticks")

    val humanImpactTypes = listOf(
        "Bamboo Cutting", "Cart_vehicle track", "Electric Wire", "Encroachment", "Fire",
        "Fishing", "Girdling", "Grass Cutting", "Guns_Weapons", "Human presence signs",
        "Hunting Dog", "Illegal Vehicle", "Livestock_seen", "Livestock Signs", "Lopping",
        "Mining", "NTFP collection", "People seen", "Poison Material", "Snare", "Trap",
        "Tree Cutting", "Vandalism_Theft"
    )
    val actionTaken = listOf(
        "Arrest", "Fined", "POR", "POR & Arrest", "POR & Fined", "POR & Seized",
        "POR_Seized & Arrest", "Recorded without action", "Seized", "Warned"
    )

    val speciesTypes = listOf(
        "Aquatic Mammal", "Bird", "Carnivore", "Domestic", "Herbivore", "Primate Arboreal", "Reptile"
    )
    val speciesByType = mapOf(
        "Aquatic Mammal" to listOf(
            "Eurasian Otter", "Humpback dolphin", "Indo_pacific_finless_porpoise",
            "Irrawaddy Dolphin", "Oriental Small clawed Otter", "Others", "Smooth Coated Otter"
        ),
        "Bird" to listOf(
            "Changeable Hawk-Eagle", "Cinereous Vulture", "Egyptian Vulture", "Eurasian Eagle Owl",
            "Greater Flamingo", "Great Indian Bustard", "Grey headed Fish eagle", "Grey Junglefowl",
            "Griffon Vulture", "Indian Grey Hornbill", "Lesser Adjutant Stork", "Lesser Flamingo",
            "Lesser Florican", "Long Billed Vulture", "Malabar Pied Hornbill",
            "Oriental Pied Hornbill", "Others", "Peafowl", "Red Headed Vulture", "Red Junglefowl",
            "Sarus Crane", "Sea Eagle", "White Rumped Vulture"
        ),
        "Carnivore" to listOf(
            "Brown Palm Civet", "Common Grey Mongoose", "Dhole Wild Dog", "Fishing Cat",
            "Golden Jackal", "Indian Fox", "Indian Pangolin", "Jungle Cat", "Leopard",
            "Leopard Cat", "Madras Hedgehog", "Others", "Palm Civet", "Ratel Honey badger",
            "Ruddy Mongoose", "Rusty spotted Cat", "Sloth Bear", "Small Indian Civet",
            "Striped Hyena", "Stripe necked Mongoose", "Tiger", "Wolf"
        ),
        "Domestic" to listOf("Domestic_cat", "Domestic_dog", "Domestic_pig"),
        "Herbivore" to listOf(
            "Barking Deer", "Blackbuck", "Chinkara India Gazelle", "Chital or Spotted Deer",
            "Elephant", "Four Horned Antelope Chowsingha", "Gaur", "Mouse deer", "Nilgai",
            "Others", "Porcupine", "Sambar", "Wild Pig"
        ),
        "Primate Arboreal" to listOf(
            "Bonnet macaque", "Flying Squirrel", "Giant Squirrel", "Hanuman langur", "Others",
            "Rhesus macaque", "Slender Loris", "Slow Loris"
        ),
        "Reptile" to listOf(
            "King Cobra", "Monitor Lizard", "Mugger", "Others", "Python",
            "Saltwater crocodile", "Yellow Monitor Lizard"
        )
    )

    val causeOfDeath = listOf(
        "Abandoned young", "Depredation", "Disease_infection", "Electrocution", "Old age",
        "Open well", "Poaching_hunting", "Poisoning", "Road_rail kill", "Starvation",
        "Territorial fight_infanticide", "Unknown"
    )
    val carcassState = listOf("Fresh", "Old", "Very Old")

    val signTypes = listOf(
        "Antler_Rubbing", "Digging", "Direct Sighting", "Feather", "Kill", "Pugmark_Track",
        "Rake", "Rolling", "Scat_and_Scrape", "Scat_Pellets_Dung", "Scrape", "Spray",
        "Vocalization"
    )
    val ageOfTracks = listOf("Fresh", "Old", "Very Old")

    val waterSourceTypes = listOf("Artificial", "Natural")
    val waterQuality = listOf("Good", "Moderate", "Poor")
    val humanSigns = listOf(
        "Camp_Fire", "Cigarette_bidi_Other_Evidence", "Direct Sighting", "Footprints",
        "Poison", "Snare_Trap"
    )
    val animalSigns = signTypes
}
