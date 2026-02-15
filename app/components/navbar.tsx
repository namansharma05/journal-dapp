import { useAppDispatch } from "../redux/hooks";
import { openNewEntryModal } from "../redux/slices/openNewEntryModal";

export function Navbar() {
  const dispatch = useAppDispatch();
  return (
    <div className="px-[10%] py-[3%] md:px-[11%] md:py-[3%] lg:px-[12%] lg:py-[2%] border-b mb-5">
      <div className="flex justify-between items-center">
        <div className="">My Journal</div>
        <div
          onClick={() => dispatch(openNewEntryModal())}
          className="bg-orange-400 rounded-lg px-5 py-2 cursor-pointer hover:bg-orange-300 hover:duration-50"
        >
          + New Entry
        </div>
      </div>
    </div>
  );
}
