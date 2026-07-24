class_name LevelSpec
extends Resource

@export var id: StringName
@export var label: String = ""
@export_multiline var story: String = ""
@export_range(1.0, 3600.0, 1.0, "or_greater", "suffix:s") var duration_sec: float = 60.0
@export_range(0.0, 100.0, 1.0, "suffix:%") var win_survival_pct: float = 50.0
@export var plankton: PlanktonSpec
@export var prey_fish: PopulationSpec
@export var rival_fish: PopulationSpec
@export var narrow_gaps: bool = false
@export var dressing: DressingSpec


func is_complete() -> bool:
	return (
		not id.is_empty()
		and not label.is_empty()
		and duration_sec > 0.0
		and plankton != null
		and prey_fish != null
		and rival_fish != null
		and dressing != null
	)

