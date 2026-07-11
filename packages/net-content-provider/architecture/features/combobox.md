# ComboBox02 - Generic Item Selection Component

## Overview

ComboBox02 is a Blazor dropdown component that supports binding to lists of complex objects (like `ItemModel`) while displaying user-friendly text and returning specific property values.

## Problem Statement

The original ComboBox02 only supported `List<string>` which was limiting when working with complex objects like `ItemModel` where:
- We need to display the `Name` property to the user
- We need to return the `Id` property when an item is selected
- We need access to the full object for additional operations

## Solution Architecture

### Component Design

The ComboBox02 component now supports generic item selection through the following parameters:

```razor
<!-- For List<ItemModel> -->
<ComboBox02
    Items="AllRepoModels"
    TextSelector="@GetItemName"
    ValueSelector="@GetItemId"
    SelectedItemChanged="OnSelectedItemChanged"
/>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `Items` | `List<ItemModel>` | The list of items to display in the dropdown |
| `TextSelector` | `Func<ItemModel, string>` | Function to extract display text from each item |
| `ValueSelector` | `Func<ItemModel, string>` | Function to extract the value for each item |
| `SelectedItem` | `string` | The currently selected value |
| `SelectedItemChanged` | `EventCallback<string>` | Callback when selection changes |

### Implementation Details

```razor
<select @bind="SelectedItem" class="dropdown-down">
    @foreach (var item in Items)
    {
        <option value="@ValueSelector(item)">@TextSelector(item)</option>
    }
</select>
```

### Usage Example

```csharp
// In the parent component
private List<ItemModel> AllRepoModels { get; set; } = new();

// Selector functions
private string GetItemName(ItemModel item) => item.Name;
private string GetItemId(ItemModel item) => item.Id;

// Handle selection change
private void OnSelectedItemChanged(string itemId)
{
    // itemId is the Id of the selected item
    var selectedModel = AllRepoModels.First(x => x.Id == itemId);
    // Use the full model...
}
```

## Benefits

1. **Flexibility**: Works with any object that has display text and value properties
2. **Type Safety**: Strongly-typed selector functions
3. **Separation of Concerns**: Display logic separated from value logic
4. **Reusability**: Can be used with different models by changing selectors

## Related Files

- `front_blazor/BlazorApp/Components/ComboBox02.razor` - Component implementation
- `front_blazor/BackendAdapters/Models/ItemModel.cs` - Model used in examples
- `front_blazor/BlazorApp/Pages/Repos.razor` - Usage example