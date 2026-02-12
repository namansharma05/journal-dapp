export function Navbar() {
  return (
    <div className="px-[10%] py-[3%] md:px-[11%] md:py-[3%] lg:px-[12%] lg:py-[2%] border-b mb-5 md:mb-0 lg:mb-0">
      <div className="flex justify-between items-center">
        <div className="">My Journal</div>
        <div className="bg-orange-400 rounded-lg px-5 py-2">+ New Entry</div>
      </div>
    </div>
  );
}
