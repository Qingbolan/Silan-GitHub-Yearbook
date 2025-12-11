from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, List, Dict

class FilterStrategy(ABC):
    """Interface for filtering strategies."""
    
    @abstractmethod
    def apply(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Apply filter to the data."""
        pass

class Context:
    """Holds filtering context like 'current date' for validation."""
    pass

class DateRangeFilter(FilterStrategy):
    """Filters contributions to strictly match a start and end date."""
    
    def __init__(self, start_date: str, end_date: str):
        self.start = datetime.fromisoformat(start_date)
        self.end = datetime.fromisoformat(end_date)
        # Ensure we cover the full end day
        if "T" not in end_date:
            self.end = self.end.replace(hour=23, minute=59, second=59)

    def apply(self, data: Dict[str, Any]) -> Dict[str, Any]:
        # Filter daily contributions
        daily = data.get("dailyContributions", [])
        filtered_daily = [
            d for d in daily 
            if self.start <= datetime.fromisoformat(d["date"]) <= self.end
        ]
        
        # Recalculate totals based on filtered daily
        # Note: Repositories might need more complex logic if we have per-commit timestamps
        # For now, we assume the provider returns roughly correct range, 
        # but this filter enforces strict boundaries on the daily list.
        
        total = sum(d["count"] for d in filtered_daily)
        
        # Create a shallow copy to modify
        filtered_data = data.copy()
        filtered_data["dailyContributions"] = filtered_daily
        filtered_data["totalContributions"] = total
        # Determine active days
        filtered_data["activeDays"] = len([d for d in filtered_daily if d["count"] > 0])
        
        return filtered_data

class YearFilter(FilterStrategy):
    """Standard calendar year filter."""
    
    def __init__(self, year: int):
        self.year = year

    def apply(self, data: Dict[str, Any]) -> Dict[str, Any]:
        # Similar to DateRange but specific to YYYY-01-01 -> YYYY-12-31
        # In practice, provider should have fetched this range, 
        # but we enforce correctness here.
        start = datetime(self.year, 1, 1)
        end = datetime(self.year, 12, 31, 23, 59, 59)
        
        daily = data.get("dailyContributions", [])
        filtered_daily = [
            d for d in daily 
            if start <= datetime.fromisoformat(d["date"]) <= end
        ]
        
        filtered_data = data.copy()
        filtered_data["dailyContributions"] = filtered_daily
        filtered_data["activeDays"] = len([d for d in filtered_daily if d["count"] > 0])
        
        return filtered_data
