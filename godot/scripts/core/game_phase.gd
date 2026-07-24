class_name GamePhase
extends RefCounted

enum Value {
	TUNING,
	RUNNING,
	VERDICT,
	INHERIT,
}


static func display_name(value: Value) -> String:
	match value:
		Value.TUNING:
			return "TUNING · 调参"
		Value.RUNNING:
			return "RUNNING · 演算"
		Value.VERDICT:
			return "VERDICT · 结算"
		Value.INHERIT:
			return "INHERIT · 封代"
		_:
			push_error("Unknown GamePhase value: %s" % value)
			return "UNKNOWN"

