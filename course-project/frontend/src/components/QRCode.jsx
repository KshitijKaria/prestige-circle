import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { FaDownload, FaShare } from "react-icons/fa";
import "./LandingPage.css";

function QRCodeBox({ user }) {
  const qrRef = useRef();

  const handleDownload = () => {
    const qrCanvas = qrRef.current.querySelector("canvas");
    const pngUrl = qrCanvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = `${user.name}_qr.png`;
    link.click();
  };

  return (
    <div className="qr-section">
      <h2>Your QR Code</h2>

      <div ref={qrRef}>
        <QRCodeCanvas
          value={`userID:${user.id}`}
          size={200}
          bgColor="#ffffff"
          fgColor="#000000"
          includeMargin={true}
        />
      </div>

      <button className="action-btn" onClick={handleDownload}>
        <FaDownload className="btn-icon" /> Download
      </button>
      <button
        className="action-btn"
        onClick={() =>
          navigator.share &&
          navigator.share({
            title: "My QR Code",
            text: "Scan my QR code!",
            url: window.location.href,
          })
        }
      >
        <FaShare className="btn-icon" />
        Share
      </button>
    </div>
  );
}

export default QRCodeBox;
