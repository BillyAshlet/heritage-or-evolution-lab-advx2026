class_name TraitsSpec
extends Resource

@export_range(0.0, 100.0, 1.0) var speed: float = 50.0
@export_range(0.0, 100.0, 1.0) var size: float = 50.0
@export_range(0.0, 100.0, 1.0) var stamina: float = 50.0
@export var foraging_enabled: bool = false
@export_range(0.0, 100.0, 1.0) var foraging: float = 50.0


func duplicate_spec() -> TraitsSpec:
	return duplicate(true) as TraitsSpec


func as_dictionary() -> Dictionary:
	var values: Dictionary = {
		"speed": speed,
		"size": size,
		"stamina": stamina,
	}
	if foraging_enabled:
		values["foraging"] = foraging
	return values

