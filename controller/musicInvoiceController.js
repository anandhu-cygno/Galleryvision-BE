const MusicInvoice = require("../database/model/musicInvoice");
const Music = require('../database/model/musics');
const Licensor = require("../database/model/licensor");
const Currency = require("../database/model/currency");
const { ObjectId } = require("mongodb");

// Generate Invoice
exports.generateMusicInvoice = async (req, res) => {
  try {
    const { date } = req.body;
    console.log("music date", date);

    // Parse the date from the request body (assuming the format is "Month Year")
    const [month, year] = date.split(" ");
    const targetDate = new Date(year, ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(month), 1);

    const musics = await Music.find({
      "assets.date": date
    });

    if (!musics || musics.length === 0) {
      return res.status(404).json({ error: "No music data found for the provided date" });
    }

    // Fetch all licensor details
    const licensors = await Licensor.find();
    if (!licensors || licensors.length === 0) {
      return res.status(404).json({ error: "No licensor data found" });
    }

    // Fetch currency conversion rates for the given date
    const currencyRate = await Currency.findOne({ date });
    if (!currencyRate) {
      return res.status(404).json({ error: "No currency data found for the provided date" });
    }

    // Fetch the last generated invoice number
    let lastInvoiceNumber = await MusicInvoice.findOne().sort({ _id: -1 }).limit(1);
    let invoiceCounter = lastInvoiceNumber ? parseInt(lastInvoiceNumber.invoiceNumber.slice(-4)) + 1 : 1;

    // Create an array to store generated invoices
    const invoices = [];

    const generateInvoiceNumber = (num) => {
      const prefix = 'INVMU';
      const paddedNum = String(num).padStart(6, '0'); // Pad the number with leading zeros to ensure it is 4 digits long
      return `${prefix}${paddedNum}`;
    };

    for (const music of musics) {
      // Check if an invoice already exists for this musicId and date
      const existingInvoice = await MusicInvoice.findOne({ musicId: music.musicId, date });
      if (existingInvoice) {
        console.warn(`Invoice already exists for musicId: ${music.musicId}, date: ${date}`);
        continue; // Skip this music entry if the invoice already exists
      }

      // Find the corresponding licensor for this music entry
      const licensor = licensors.find(l => l._id.toString() === music.licensorId.toString());
      if (!licensor) {
        console.warn(`Licensor not found for musicId: ${music._id}, licensorId: ${music.licensorId}`);
        continue; // Skip this music entry if the licensor is not found
      }

      // Extract required fields from licensor
      const partnerName = licensor.companyName;
      const licensorId = licensor._id;
      const licensorName = licensor.licensorName;
      const accNum = licensor.bankAccNum;
      const currency = licensor.currency;
      const licensorAddress = licensor.licensorAddress
      const status = "unpaid";
      const musicId = music.musicId;
      const musicName = music.musicName;
      const invoiceNumber = generateInvoiceNumber(invoiceCounter++); // Generate and increment invoice number

      // Set IFSC or IBAN based on the currency
      let ifsc = "";
      let iban = "";
      if (currency === "INR") {
        ifsc = licensor.ifsc_iban;
      } else if (currency === "USD") {
        iban = licensor.ifsc_iban;
      }

      // Find the asset with the target date
      const asset = music.assets.find(a => {
        const assetDate = new Date(a.date);
        return assetDate.getMonth() === targetDate.getMonth() && assetDate.getFullYear() === targetDate.getFullYear();
      });

      // Calculate financial fields
      const ptRevenue = parseFloat(asset.partnerRevenue).toFixed(2);
      const tax = (parseFloat(ptRevenue) * 0.15).toFixed(2); // assuming 15% tax
      const ptAfterTax = (parseFloat(ptRevenue) - parseFloat(tax)).toFixed(2);
      const commissionRate = parseFloat(music.commission) / 100;
      const commissionAmount = (ptAfterTax * commissionRate).toFixed(2);
      const totalPayout = (ptAfterTax - parseFloat(commissionAmount)).toFixed(2);

      // Get the conversion rate based on the currency
      let conversionRate = 1.0; // default value if no conversion is needed
      if (currency === "INR") {
        conversionRate = parseFloat(currencyRate.INR);
      } else if (currency === "USD") {
        conversionRate = parseFloat(currencyRate.USD);
      }

      const payout = (parseFloat(totalPayout) * conversionRate).toFixed(2);

      // Create invoice
      const invoice = new MusicInvoice({
        partnerName,
        licensorId,
        licensorName,
        licensorAddress,
        accNum,
        ifsc,
        iban,
        currency,
        musicId,
        musicName,
        invoiceNumber,
        date,
        ptRevenue,
        tax,
        ptAfterTax,
        commission: music.commission,
        commissionAmount,
        totalPayout,
        conversionRate: conversionRate.toFixed(2),
        payout,
        status
      });

      await invoice.save();
      invoices.push(invoice);
    }

    if (invoices.length === 0) {
      return res.status(404).json({ error: `Invoices already generated for date: ${date}` });
    }

    // Return all generated invoices
    res.status(200).json({ message: `Music invoices generated for ${date}`, invoices });
    console.log(`Music invoices generated for ${date}`);

  } catch (error) {
    console.error("Error generating invoices:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// exports.generateMusicInvoice = async (req, res) => {
//   try {
//     const { date } = req.body;
//     console.log("music date", date);

//     // Parse the date from the request body (assuming the format is "Month Year")
//     const [month, year] = date.split(" ");
//     const targetDate = new Date(year, ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(month), 1);

//     const musics = await Music.find({
//       "assets.date": date
//     });

//     if (!musics || musics.length === 0) {
//       return res.status(404).json({ error: "No music data found for the provided date" });
//     }

//     // Fetch all licensor details
//     const licensors = await Licensor.find();
//     if (!licensors || licensors.length === 0) {
//       return res.status(404).json({ error: "No licensor data found" });
//     }

//     // Create an array to store generated invoices
//     const invoices = [];

//     const generateInvoiceNumber = (num) => {
//       const prefix = 'INVMU';
//       const paddedNum = String(num).padStart(4, '0'); // Pad the number with leading zeros to ensure it is 4 digits long
//       return `${prefix}${paddedNum}`;
//     };

//     let invoiceCounter = 1; // Initialize a counter for invoice numbers

//     for (const music of musics) {
//       // Find the corresponding licensor for this music entry
//       const licensor = licensors.find(l => l._id.toString() === music.licensorId.toString());
//       if (!licensor) {
//         console.warn(`Licensor not found for musicId: ${music._id}, licensorId: ${music.licensorId}`);
//         continue; // Skip this music entry if the licensor is not found
//       }

//       // Extract required fields from licensor
//       const partnerName = licensor.companyName;
//       const licensorId = licensor._id;
//       const licensorName = licensor.licensorName;
//       const accNum = licensor.bankAccNum;
//       const currency = licensor.currency;
//       const status = "unpaid";
//       const musicId = music.musicId;
//       const musicName = music.musicName;
//       const invoiceNumber = generateInvoiceNumber(invoiceCounter++); // Generate and increment invoice number

//       // Set IFSC or IBAN based on the currency
//       let ifsc = "";
//       let iban = "";
//       if (currency === "INR") {
//         ifsc = licensor.ifsc_iban;
//       } else if (currency === "USD") {
//         iban = licensor.ifsc_iban;
//       }

//       // Find the asset with the target date
//       const asset = music.assets.find(a => {
//         const assetDate = new Date(a.date);
//         return assetDate.getMonth() === targetDate.getMonth() && assetDate.getFullYear() === targetDate.getFullYear();
//       });

//       // Check if an invoice already exists for this musicId and date
//       const existingInvoice = await MusicInvoice.findOne({ musicId, date });
//       if (existingInvoice) {
//         res.status(404).json(`Invoice already exists for musicId: ${musicId}, date: ${date}`)
//         console.warn(`Invoice already exists for musicId: ${musicId}, date: ${date}`);
//         continue; // Skip this music entry if the invoice already exists
//       }

//       // Calculate financial fields
//       const ptRevenue = parseFloat(asset.partnerRevenue).toFixed(2);
//       const tax = (parseFloat(ptRevenue) * 0.15).toFixed(2); // assuming 15% tax
//       const ptAfterTax = (parseFloat(ptRevenue) - parseFloat(tax)).toFixed(2);
//       const commissionRate = parseFloat(music.commission) / 100;
//       const commissionAmount = (ptAfterTax * commissionRate).toFixed(2);
//       const totalPayout = (ptAfterTax - parseFloat(commissionAmount)).toFixed(2);
//       const conversionRate = 1.0; // assuming no conversion for simplicity
//       const payout = (parseFloat(totalPayout) * conversionRate).toFixed(2);

//       // Create invoice
//       const invoice = new MusicInvoice({
//         partnerName,
//         licensorId,
//         licensorName,
//         accNum,
//         ifsc,
//         iban,
//         currency,
//         musicId,
//         musicName,
//         invoiceNumber,
//         date,
//         ptRevenue,
//         tax,
//         ptAfterTax,
//         commission: music.commission,
//         commissionAmount,
//         totalPayout,
//         conversionRate: conversionRate.toFixed(2),
//         payout,
//         status
//       });

//       await invoice.save();
//       invoices.push(invoice);
//     }

//     // Return all generated invoices
//     res.status(201).json(invoices);
//     console.log(`Music invoices generated for ${date}`);

//   } catch (error) {
//     console.error("Error generating invoices:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// };


  // get licensors
  exports.getMusicInvoice = async (req, res) => {
    try {
      const invoices = await MusicInvoice.find();
  
      if (invoices.length > 0) {
        res.status(200).json(invoices);
      } else {
        res.status(404).json("No invoices found");
      }
    } catch (error) {
      console.error(error);
      res.status(500).json("Internal server error");
    }
  };

// get particular licensor
exports.viewMusicInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const objectId = new ObjectId(id);
    const invoiceDetails = await musicInvoices.findOne({ _id: objectId });

    if (!invoiceDetails) {
      return res.status(404).json({ error: 'invoice not found' });
    }

    return res.status(200).json(invoiceDetails);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid licensor ID' });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
};




