export function getSeverity(userCount: number) {
  if (userCount >= 10) {
    return {
      color: "red",
      radius: 20,
      label: "High Priority (Heavy Traffic)",
    };
  }

  if (userCount >= 5) {
    return {
      color: "orange",
      radius: 15,
      label: "Medium Priority",
    };
  }

  return {
    color: "green",
    radius: 10,
    label: "Low Priority",
  };
}
