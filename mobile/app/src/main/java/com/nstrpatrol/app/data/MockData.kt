package com.nstrpatrol.app.data

/**
 * Static mock data mirroring the Penpot designs. API integration is deferred to
 * a later phase, so screens render from these lists for now.
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
    val teamLeaders = listOf("B. Thapa", "K. Venkatesh", "P. Gurung", "R. Sharma", "S. Tamang")
    val memberNames = emptyList<String>()
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

object Patrols {
    data class Patrol(
        val name: String,
        val status: String,
        val ranger: String,
        val whenText: String,
        val distance: String,
        val target: String
    )

    val list = listOf(
        Patrol("Central Zone Patrol 01", "IN PROGRESS", "Ranger K. Vance", "Today, 08:30 AM", "4.2 km covered", "Target: 12 km (35%)"),
        Patrol("East Ridge Patrol 03", "COMPLETED", "Ranger M. Sterling", "Yesterday, 07:15 AM", "14.8 km covered", "Target: 14.8 km (100%)"),
        Patrol("North Lake Boundary", "SCHEDULED", "Ranger J. Doe", "Tomorrow, 06:00 AM", "0 km covered", "Target: 8.5 km (0%)"),
        Patrol("South Valley Checkpoint", "COMPLETED", "Ranger S. Awan", "Oct 24, 2026", "10.2 km covered", "Target: 10.2 km (100%)")
    )
}

object LogsData {
    data class LogEntry(val title: String, val time: String, val level: String)

    val entries = listOf(
        LogEntry("Tiger tracks recorded", "Today 06:45", "info"),
        LogEntry("Low water level at T-4", "Today 05:20", "info"),
        LogEntry("Poaching alert in Sector C", "Today 04:02", "alert"),
        LogEntry("Camera trap offline #T-04", "Yesterday 22:10", "warn"),
        LogEntry("Waterhole near Sauraha", "Yesterday 18:30", "info"),
        LogEntry("Zone B report synced", "Yesterday 16:05", "info"),
        LogEntry("Firewood found in Zone A", "Yesterday 14:20", "warn"),
        LogEntry("Snare removed near gate 2", "Yesterday 11:45", "alert")
    )
}

object Contacts {
    data class Contact(val name: String, val subtitle: String)

    val list = listOf(
        Contact("Control Room", "24x7 Command Centre"),
        Contact("Range Officer", "R. Sharma"),
        Contact("Forest Guard", "S. Gurung")
    )
}

object AutoDetails {
    const val gps = "27.5163° N, 84.3842° E"
    const val timestamp = "11:42 AM · 03 Aug 2026"
    const val officer = "K. Venkatesh"
    const val badge = "APF-2247"
    const val beat = "2A North"
    const val accuracy = "±4.2 m"
    const val saved = "Offline"
}

object SettingsData {
    const val name = "R. Sharma"
    const val designation = "Field Officer"
    const val language = "English"
    const val syncInterval = "Manual"
    const val mapLayer = "Offline"
}
