import SparkViewer from "@/components/tour/SparkViewer";

const testUrl = "https://wlt-ai-cdn.art/spark-2.0/rad/spaceship-lod.rad";

export default function TestSpark() {
  return (
    <div className="fixed inset-0 bg-[#080808] text-white">
      <div className="fixed top-0 left-0 right-0 h-12 z-20 bg-black/70 border-b border-white/10 flex items-center px-4">
        <span className="text-xs tracking-[0.18em] font-semibold">WVISION TEST</span>
      </div>
      <div className="absolute inset-0 pt-12">
        <SparkViewer splatUrl={testUrl} />
      </div>
    </div>
  );
}
