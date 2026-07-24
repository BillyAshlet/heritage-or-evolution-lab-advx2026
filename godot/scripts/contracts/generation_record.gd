class_name GenerationRecord
extends RefCounted

var gen: int
var traits_before: TraitsSpec
var traits_after: TraitsSpec
var changed: Array[StringName] = []
var level: LevelSpec
var verdict: StringName
var report: RoundReport


func is_complete() -> bool:
	return (
		gen > 0
		and traits_before != null
		and traits_after != null
		and level != null
		and not verdict.is_empty()
		and report != null
		and report.is_consistent()
	)

