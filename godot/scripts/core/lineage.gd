class_name Lineage
extends RefCounted

var _records: Array[GenerationRecord] = []


func append(record: GenerationRecord) -> bool:
	if record == null or not record.is_complete():
		push_error("Lineage: refused incomplete generation record")
		return false
	var expected_generation: int = _records.size() + 1
	if record.gen != expected_generation:
		push_error(
			"Lineage: expected generation %d, received %d"
			% [expected_generation, record.gen]
		)
		return false
	_records.append(record)
	return true


func records() -> Array[GenerationRecord]:
	return _records.duplicate()


func size() -> int:
	return _records.size()

