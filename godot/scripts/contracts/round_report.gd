class_name RoundReport
extends RefCounted

var survivors: int = 0
var initial: int = 0
var deaths_eaten: int = 0
var deaths_starved: int = 0
var final_traits: TraitsSpec
var events: Array[Dictionary] = []


func is_consistent() -> bool:
	if min(initial, survivors, deaths_eaten, deaths_starved) < 0:
		return false
	return survivors + deaths_eaten + deaths_starved == initial


func as_dictionary() -> Dictionary:
	return {
		"survivors": survivors,
		"initial": initial,
		"deaths": {
			"eaten": deaths_eaten,
			"starved": deaths_starved,
		},
		"finalTraits": final_traits.as_dictionary() if final_traits != null else {},
		"events": events.duplicate(true),
	}

