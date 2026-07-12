/**
 * Splits a CpItem.Address ("<repoGuid>/01/02" or just "<repoGuid>" for a
 * repo root) back into its repoGuid and loca parts — the reverse of
 * cp-files' computeAddress. Needed here because BackendAdapter.getItem
 * takes (repoGuid, loca) separately, but a Folder's child-navigation only
 * has the CURRENT item's combined Address to work from (same as Blazor's
 * FolderView.OnBtnClicked, which does the equivalent split+rejoin).
 */
export function splitAddress(address: string): { repoGuid: string; loca: string } {
  const slashIndex = address.indexOf("/");
  if (slashIndex === -1) {
    return { repoGuid: address, loca: "" };
  }
  return { repoGuid: address.slice(0, slashIndex), loca: address.slice(slashIndex + 1) };
}

export function joinLoca(loca: string, childIndex: string): string {
  return loca ? `${loca}/${childIndex}` : childIndex;
}
