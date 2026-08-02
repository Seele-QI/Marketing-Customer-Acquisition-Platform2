from dataclasses import dataclass, asdict
from typing import Any, Dict, Optional


@dataclass
class PublishResult:
    success: bool
    platform: str
    post_id: Optional[str] = None
    url: Optional[str] = None
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
