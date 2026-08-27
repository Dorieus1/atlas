function Skeleton({ className = "" }) {

  return (
    <div className={`animate-pulse rounded-lg bg-surface-muted ${className}`} />
  );

}


export function SkeletonText({ lines = 3, className = "" }) {

  const widths = ["w-full", "w-11/12", "w-2/3", "w-5/6", "w-3/4"];

  return (
    <div className={`space-y-2 ${className}`}>

      {Array.from({ length: lines }).map((_, index) => (

        <Skeleton
          key={index}
          className={`h-3 ${widths[index % widths.length]}`}
        />

      ))}

    </div>
  );

}


export default Skeleton;
