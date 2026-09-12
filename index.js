// MOTORCYCLE SHOWROOM - CLEAN INDEX.JS
// Generated from the uploaded source. The Sales INSERT uses sale_date (not saleDate).

const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Reminder automation settings
const N8N_REMINDER_WEBHOOK = String(process.env.N8N_REMINDER_WEBHOOK || "").trim();
const REMINDER_CHECK_INTERVAL_MS = Math.max(5, Number(process.env.REMINDER_CHECK_INTERVAL_MINUTES) || 15) * 60 * 1000;
const DEFAULT_REMINDER_DAYS = Math.max(0, Number(process.env.DEFAULT_REMINDER_DAYS) || 3);
const DEFAULT_OVERDUE_ALERT_DAYS = Math.max(0, Number(process.env.DEFAULT_OVERDUE_ALERT_DAYS) || 1);

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static("public"));


// ======================================================
// MYSQL CONNECTION
// ======================================================

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "motorcycle_showroom",
    port: Number(process.env.DB_PORT) || 3306,

    ssl: {
        rejectUnauthorized: false
    },

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


// ======================================================
// HELPERS
// ======================================================

async function columnExists(tableName, columnName) {

    const [rows] = await db.query(
        `
        SELECT COUNT(*) AS total
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        `,
        [tableName, columnName]
    );

    return Number(rows[0].total) > 0;
}


async function addColumnIfMissing(
    tableName,
    columnName,
    definition
) {

    const exists = await columnExists(
        tableName,
        columnName
    );

    if (!exists) {

        await db.query(
            `
            ALTER TABLE \`${tableName}\`
            ADD COLUMN \`${columnName}\` ${definition}
            `
        );

        console.log(
            `Added column: ${tableName}.${columnName}`
        );
    }
}


function addMonths(dateString, months) {

    const date = new Date(
        `${dateString}T00:00:00`
    );

    const originalDay = date.getDate();

    date.setMonth(
        date.getMonth() + months
    );

    // Handle month-end dates
    if (date.getDate() !== originalDay) {
        date.setDate(0);
    }

    return date
        .toISOString()
        .split("T")[0];
}


function buildInstallmentSchedule(
    firstDueDate,
    count,
    amount
) {

    const result = [];

    for (let i = 0; i < count; i++) {

        result.push({
            installment_number: i + 1,

            due_date: addMonths(
                firstDueDate,
                i
            ),

            amount: Number(amount),

            paid_amount: 0,

            status: "Pending"
        });
    }

    return result;
}


// ======================================================
// DATABASE SETUP
// ======================================================

async function setupDatabase() {

    try {

        // ------------------------------------------------
        // CONNECTION TEST
        // ------------------------------------------------

        const connection =
            await db.getConnection();

        console.log(
            "MySQL database connected successfully!"
        );

        connection.release();


        // =================================================
        // CUSTOMERS
        // =================================================

        await db.query(`
            CREATE TABLE IF NOT EXISTS customers (

                id INT AUTO_INCREMENT PRIMARY KEY,

                customer_name VARCHAR(150) NOT NULL,

                father_name VARCHAR(150),

                cnic VARCHAR(30),

                phone VARCHAR(30) NOT NULL,

                alternate_phone VARCHAR(30),

                address TEXT,

                city VARCHAR(100),

                occupation VARCHAR(100),

                reference_name VARCHAR(150),

                reference_phone VARCHAR(30),

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            )
        `);


        // =================================================
        // MOTORCYCLES
        // =================================================

        await db.query(`
            CREATE TABLE IF NOT EXISTS motorcycles (

                id INT AUTO_INCREMENT PRIMARY KEY,

                company VARCHAR(100),

                model VARCHAR(100) NOT NULL,

                model_year INT,

                color VARCHAR(50),

                engine_number VARCHAR(100),

                chassis_number VARCHAR(100),

                registration_number VARCHAR(100),

                purchase_price DECIMAL(12,2)
                    DEFAULT 0,

                sale_price DECIMAL(12,2)
                    DEFAULT 0,

                stock_status VARCHAR(30)
                    DEFAULT 'In Stock',

                purchase_date DATE,

                notes TEXT,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP
            )
        `);


        // ------------------------------------------------
        // OLD MOTORCYCLE TABLE MIGRATION
        // ------------------------------------------------

        await addColumnIfMissing(
            "motorcycles",
            "company",
            "VARCHAR(100) NULL"
        );


        await addColumnIfMissing(
            "motorcycles",
            "stock_status",
            "VARCHAR(30) NOT NULL DEFAULT 'In Stock'"
        );


        await addColumnIfMissing(
            "motorcycles",
            "created_at",
            "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        );


        await addColumnIfMissing(
            "motorcycles",
            "updated_at",
            "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
        );


        // Copy old brand -> company
        const brandExists =
            await columnExists(
                "motorcycles",
                "brand"
            );

        const companyExists =
            await columnExists(
                "motorcycles",
                "company"
            );

        if (
            brandExists &&
            companyExists
        ) {

            await db.query(`
                UPDATE motorcycles

                SET company = brand

                WHERE
                    (company IS NULL OR company = '')
                    AND brand IS NOT NULL
            `);
        }


        // =================================================
        // SALES
        // =================================================

        await db.query(`
            CREATE TABLE IF NOT EXISTS sales (

                id INT AUTO_INCREMENT PRIMARY KEY,

                customer_id INT NOT NULL,

                motorcycle_id INT NOT NULL,

                sale_date DATE NOT NULL,

                sale_type VARCHAR(30)
                    DEFAULT 'Cash',

                sale_price DECIMAL(12,2)
                    DEFAULT 0,

                total_price DECIMAL(12,2)
                    DEFAULT 0,

                advance_payment DECIMAL(12,2)
                    DEFAULT 0,

                remaining_balance DECIMAL(12,2)
                    DEFAULT 0,

                installment_count INT NULL,

                installment_amount DECIMAL(12,2) NULL,

                first_due_date DATE NULL,

                reminder_days INT
                    DEFAULT 3,

                sale_status VARCHAR(30)
                    DEFAULT 'Active',

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            )
        `);


        // ------------------------------------------------
        // OLD SALES TABLE MIGRATION
        // ------------------------------------------------

        await addColumnIfMissing(
            "sales",
            "customer_id",
            "INT NULL"
        );


        await addColumnIfMissing(
            "sales",
            "motorcycle_id",
            "INT NULL"
        );


        await addColumnIfMissing(
            "sales",
            "sale_date",
            "DATE NULL"
        );


        await addColumnIfMissing(
            "sales",
            "sale_type",
            "VARCHAR(30) DEFAULT 'Cash'"
        );


        await addColumnIfMissing(
            "sales",
            "sale_price",
            "DECIMAL(12,2) DEFAULT 0"
        );


        await addColumnIfMissing(
            "sales",
            "total_price",
            "DECIMAL(12,2) DEFAULT 0"
        );


        await addColumnIfMissing(
            "sales",
            "advance_payment",
            "DECIMAL(12,2) DEFAULT 0"
        );


        await addColumnIfMissing(
            "sales",
            "remaining_balance",
            "DECIMAL(12,2) DEFAULT 0"
        );


        await addColumnIfMissing(
            "sales",
            "installment_count",
            "INT NULL"
        );


        await addColumnIfMissing(
            "sales",
            "installment_amount",
            "DECIMAL(12,2) NULL"
        );


        await addColumnIfMissing(
            "sales",
            "first_due_date",
            "DATE NULL"
        );


        await addColumnIfMissing(
            "sales",
            "reminder_days",
            "INT DEFAULT 3"
        );


        await addColumnIfMissing(
            "sales",
            "sale_status",
            "VARCHAR(30) DEFAULT 'Active'"
        );


        await addColumnIfMissing(
            "sales",
            "created_at",
            "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        );


        // ------------------------------------------------
        // KEEP OLD SALE PRICE DATA IN SYNC
        // ------------------------------------------------

        await db.query(`
            UPDATE sales

            SET total_price = sale_price

            WHERE
                (total_price IS NULL OR total_price = 0)
                AND sale_price IS NOT NULL
        `);


        await db.query(`
            UPDATE sales

            SET sale_price = total_price

            WHERE
                (sale_price IS NULL OR sale_price = 0)
                AND total_price IS NOT NULL
        `);


        // =================================================
        // INSTALLMENTS
        // =================================================

        await db.query(`
            CREATE TABLE IF NOT EXISTS installments (

                id INT AUTO_INCREMENT PRIMARY KEY,

                sale_id INT NOT NULL,

                installment_number INT NOT NULL,

                due_date DATE NOT NULL,

                amount DECIMAL(12,2)
                    NOT NULL DEFAULT 0,

                paid_amount DECIMAL(12,2)
                    NOT NULL DEFAULT 0,

                status VARCHAR(30)
                    NOT NULL DEFAULT 'Pending',

                paid_date DATE NULL,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                INDEX idx_sale_id (sale_id),

                INDEX idx_due_date (due_date),

                INDEX idx_status (status),

                CONSTRAINT fk_installment_sale
                    FOREIGN KEY (sale_id)
                    REFERENCES sales(id)
                    ON DELETE CASCADE
            )
        `);


        // =================================================
        // INSTALLMENT PAYMENTS
        // =================================================

        await db.query(`
            CREATE TABLE IF NOT EXISTS installment_payments (

                id INT AUTO_INCREMENT PRIMARY KEY,

                sale_id INT NOT NULL,

                installment_id INT NOT NULL,

                payment_date DATE NOT NULL,

                amount DECIMAL(12,2)
                    NOT NULL DEFAULT 0,

                payment_method VARCHAR(50)
                    DEFAULT 'Cash',

                notes TEXT,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                INDEX idx_payment_sale (sale_id),

                INDEX idx_payment_installment
                    (installment_id),

                CONSTRAINT fk_payment_sale
                    FOREIGN KEY (sale_id)
                    REFERENCES sales(id)
                    ON DELETE CASCADE,

                CONSTRAINT fk_payment_installment
                    FOREIGN KEY (installment_id)
                    REFERENCES installments(id)
                    ON DELETE CASCADE
            )
        `);


        // =================================================
        // SUPPLIERS
        // Existing table is supported.
        // =================================================

        await db.query(`
            CREATE TABLE IF NOT EXISTS suppliers (

                id INT AUTO_INCREMENT PRIMARY KEY,

                supplier_name VARCHAR(150) NOT NULL,

                phone VARCHAR(30),

                alternate_phone VARCHAR(30),

                cnic VARCHAR(30),

                address TEXT,

                city VARCHAR(100),

                company_name VARCHAR(150),

                notes TEXT,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);


        // =================================================
        // PURCHASES
        // Existing table is supported.
        // =================================================

        await db.query(`
            CREATE TABLE IF NOT EXISTS purchases (

                id INT AUTO_INCREMENT PRIMARY KEY,

                supplier_id INT NULL,

                motorcycle_id INT NULL,

                purchase_date DATE NOT NULL,

                purchase_price DECIMAL(12,2) NOT NULL DEFAULT 0,

                payment_amount DECIMAL(12,2) NOT NULL DEFAULT 0,

                remaining_balance DECIMAL(12,2) NOT NULL DEFAULT 0,

                payment_status VARCHAR(30) DEFAULT 'Paid',

                payment_method VARCHAR(50) DEFAULT 'Cash',

                invoice_number VARCHAR(100),

                notes TEXT,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);


        // Ensure expected columns exist for older databases.
        await addColumnIfMissing('suppliers','alternate_phone','VARCHAR(30) NULL');
        await addColumnIfMissing('suppliers','cnic','VARCHAR(30) NULL');
        await addColumnIfMissing('suppliers','address','TEXT NULL');
        await addColumnIfMissing('suppliers','city','VARCHAR(100) NULL');
        await addColumnIfMissing('suppliers','company_name','VARCHAR(150) NULL');
        await addColumnIfMissing('suppliers','notes','TEXT NULL');
        await addColumnIfMissing('suppliers','created_at','TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

        await addColumnIfMissing('purchases','supplier_id','INT NULL');
        await addColumnIfMissing('purchases','motorcycle_id','INT NULL');
        await addColumnIfMissing('purchases','purchase_date','DATE NULL');
        await addColumnIfMissing('purchases','purchase_price','DECIMAL(12,2) DEFAULT 0');
        await addColumnIfMissing('purchases','payment_amount','DECIMAL(12,2) DEFAULT 0');
        await addColumnIfMissing('purchases','remaining_balance','DECIMAL(12,2) DEFAULT 0');
        await addColumnIfMissing("purchases", "payment_status", "VARCHAR(30) DEFAULT 'Paid'");
        await addColumnIfMissing("purchases", "payment_method", "VARCHAR(50) DEFAULT 'Cash'");
        await addColumnIfMissing('purchases','invoice_number','VARCHAR(100) NULL');
        await addColumnIfMissing('purchases','notes','TEXT NULL');
        await addColumnIfMissing('purchases','created_at','TIMESTAMP DEFAULT CURRENT_TIMESTAMP');


        // =================================================
        // EXPENSES
        // Existing database table is supported.
        // Missing columns are added safely if needed.
        // =================================================

        await db.query(`
            CREATE TABLE IF NOT EXISTS expenses (

                id INT AUTO_INCREMENT PRIMARY KEY,

                expense_title VARCHAR(150) NOT NULL,

                category VARCHAR(100) NOT NULL,

                amount DECIMAL(12,2) NOT NULL,

                expense_date DATE NOT NULL,

                payment_method VARCHAR(50) DEFAULT 'Cash',

                description TEXT,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await addColumnIfMissing(
            "expenses",
            "description",
            "TEXT NULL"
        );

        await addColumnIfMissing(
            "expenses",
            "created_at",
            "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        );


        await db.query(`
            CREATE TABLE IF NOT EXISTS reminder_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                installment_id INT NOT NULL,
                reminder_type VARCHAR(40) NOT NULL,
                reminder_date DATE NOT NULL,
                payload JSON NULL,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_installment_reminder (installment_id, reminder_type, reminder_date)
            ) ENGINE=InnoDB;
        `);

        console.log(
            "Database tables checked successfully!"
        );

    } catch (error) {

        console.error(
            "Database setup error:",
            error.message
        );

        throw error;
    }
}


// ======================================================
// BASIC API
// ======================================================

app.get("/api", (req, res) => {

    res.json({
        success: true,
        message:
            "Motorcycle Showroom API is running!"
    });

});


app.get("/api/health", async (req, res) => {

    try {

        await db.query("SELECT 1");

        res.json({
            success: true,
            database: "connected"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });
    }

});


// ======================================================
// CUSTOMERS
// ======================================================

app.get(
    "/api/customers",
    async (req, res) => {

        try {

            const search =
                (req.query.search || "")
                    .trim();


            let sql = `
                SELECT
                    id,
                    customer_name,
                    father_name,
                    cnic,
                    phone,
                    alternate_phone,
                    address,
                    city,
                    occupation,
                    reference_name,
                    reference_phone,
                    created_at
                FROM customers
            `;


            const params = [];


            if (search) {

                sql += `
                    WHERE
                        customer_name LIKE ?
                        OR father_name LIKE ?
                        OR cnic LIKE ?
                        OR phone LIKE ?
                        OR city LIKE ?
                `;


                const like =
                    `%${search}%`;


                params.push(
                    like,
                    like,
                    like,
                    like,
                    like
                );
            }


            sql += `
                ORDER BY id DESC
            `;


            const [customers] =
                await db.query(
                    sql,
                    params
                );


            res.json(customers);

        } catch (error) {

            console.error(
                "Customers error:",
                error
            );


            res.status(500).json({
                success: false,
                message:
                    "Customers load nahi ho sake.",
                error: error.message
            });
        }

    }
);


app.get(
    "/api/customers/:id",
    async (req, res) => {

        try {

            const [rows] =
                await db.query(
                    `
                    SELECT *
                    FROM customers
                    WHERE id = ?
                    `,
                    [req.params.id]
                );


            if (!rows.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Customer nahi mila."
                });
            }


            res.json(rows[0]);

        } catch (error) {

            res.status(500).json({
                success: false,
                message:
                    "Customer load nahi ho saka.",
                error: error.message
            });
        }

    }
);


app.post(
    "/api/customers",
    async (req, res) => {

        try {

            const {
                customer_name,
                father_name,
                cnic,
                phone,
                alternate_phone,
                address,
                city,
                occupation,
                reference_name,
                reference_phone
            } = req.body;


            if (
                !customer_name ||
                !phone
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Customer name aur phone required hain."
                });
            }


            const [result] =
                await db.query(
                    `
                    INSERT INTO customers
                    (
                        customer_name,
                        father_name,
                        cnic,
                        phone,
                        alternate_phone,
                        address,
                        city,
                        occupation,
                        reference_name,
                        reference_phone
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `,
                    [
                        customer_name,
                        father_name || null,
                        cnic || null,
                        phone,
                        alternate_phone || null,
                        address || null,
                        city || null,
                        occupation || null,
                        reference_name || null,
                        reference_phone || null
                    ]
                );


            res.status(201).json({
                success: true,
                message:
                    "Customer successfully saved!",
                customer_id:
                    result.insertId
            });

        } catch (error) {

            console.error(
                "Customer save error:",
                error
            );


            res.status(500).json({
                success: false,
                message:
                    "Customer add nahi ho saka.",
                error: error.message
            });
        }

    }
);


// ======================================================
// MOTORCYCLES
// ======================================================

app.get(
    "/api/motorcycles",
    async (req, res) => {

        try {

            const search =
                (req.query.search || "")
                    .trim();


            let sql = `
                SELECT

                    id,
                    company,
                    model,
                    model_year,
                    color,
                    engine_number,
                    chassis_number,
                    registration_number,
                    purchase_price,
                    sale_price,
                    stock_status,
                    purchase_date,
                    notes,
                    created_at,
                    updated_at

                FROM motorcycles
            `;


            const params = [];


            if (search) {

                sql += `
                    WHERE
                        company LIKE ?
                        OR model LIKE ?
                        OR color LIKE ?
                        OR engine_number LIKE ?
                        OR chassis_number LIKE ?
                        OR registration_number LIKE ?
                `;


                const like =
                    `%${search}%`;


                params.push(
                    like,
                    like,
                    like,
                    like,
                    like,
                    like
                );
            }


            sql += `
                ORDER BY id DESC
            `;


            const [motorcycles] =
                await db.query(
                    sql,
                    params
                );


            res.json(motorcycles);

        } catch (error) {

            console.error(
                "Motorcycles error:",
                error
            );


            res.status(500).json({
                success: false,
                message:
                    "Motorcycles load nahi ho sakin.",
                error: error.message
            });
        }

    }
);


app.get(
    "/api/motorcycles/:id",
    async (req, res) => {

        try {

            const [rows] =
                await db.query(
                    `
                    SELECT *
                    FROM motorcycles
                    WHERE id = ?
                    `,
                    [req.params.id]
                );


            if (!rows.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Motorcycle nahi mili."
                });
            }


            res.json(rows[0]);

        } catch (error) {

            res.status(500).json({
                success: false,
                message:
                    "Motorcycle load nahi ho saki.",
                error: error.message
            });
        }

    }
);


app.post(
    "/api/motorcycles",
    async (req, res) => {

        try {

            const {
                company,
                model,
                model_year,
                color,
                engine_number,
                chassis_number,
                registration_number,
                purchase_price,
                sale_price,
                stock_status,
                purchase_date,
                notes
            } = req.body;


            if (!company || !model) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Company aur Model required hain."
                });
            }


            if (engine_number) {

                const [rows] =
                    await db.query(
                        `
                        SELECT id
                        FROM motorcycles
                        WHERE engine_number = ?
                        LIMIT 1
                        `,
                        [engine_number]
                    );


                if (rows.length) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Ye Engine Number pehle se mojood hai."
                    });
                }
            }


            if (chassis_number) {

                const [rows] =
                    await db.query(
                        `
                        SELECT id
                        FROM motorcycles
                        WHERE chassis_number = ?
                        LIMIT 1
                        `,
                        [chassis_number]
                    );


                if (rows.length) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Ye Chassis Number pehle se mojood hai."
                    });
                }
            }


            const [result] =
                await db.query(
                    `
                    INSERT INTO motorcycles
                    (
                        company,
                        model,
                        model_year,
                        color,
                        engine_number,
                        chassis_number,
                        registration_number,
                        purchase_price,
                        sale_price,
                        stock_status,
                        purchase_date,
                        notes
                    )

                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `,
                    [
                        company,
                        model,
                        model_year || null,
                        color || null,
                        engine_number || null,
                        chassis_number || null,
                        registration_number || null,
                        Number(purchase_price) || 0,
                        Number(sale_price) || 0,
                        stock_status ||
                            "In Stock",
                        purchase_date || null,
                        notes || null
                    ]
                );


            res.status(201).json({
                success: true,
                message:
                    "Motorcycle successfully added!",
                motorcycle_id:
                    result.insertId
            });

        } catch (error) {

            console.error(
                "Motorcycle save error:",
                error
            );


            if (
                error.code ===
                "ER_DUP_ENTRY"
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Engine Number ya Chassis Number already exists."
                });
            }


            res.status(500).json({
                success: false,
                message:
                    "Motorcycle add nahi ho saki.",
                error: error.message
            });
        }

    }
);


app.put(
    "/api/motorcycles/:id",
    async (req, res) => {

        try {

            const {
                company,
                model,
                model_year,
                color,
                engine_number,
                chassis_number,
                registration_number,
                purchase_price,
                sale_price,
                stock_status,
                purchase_date,
                notes
            } = req.body;


            if (!company || !model) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Company aur Model required hain."
                });
            }


            const [result] =
                await db.query(
                    `
                    UPDATE motorcycles

                    SET
                        company = ?,
                        model = ?,
                        model_year = ?,
                        color = ?,
                        engine_number = ?,
                        chassis_number = ?,
                        registration_number = ?,
                        purchase_price = ?,
                        sale_price = ?,
                        stock_status = ?,
                        purchase_date = ?,
                        notes = ?

                    WHERE id = ?
                    `,
                    [
                        company,
                        model,
                        model_year || null,
                        color || null,
                        engine_number || null,
                        chassis_number || null,
                        registration_number || null,
                        Number(purchase_price) || 0,
                        Number(sale_price) || 0,
                        stock_status ||
                            "In Stock",
                        purchase_date || null,
                        notes || null,
                        req.params.id
                    ]
                );


            if (!result.affectedRows) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Motorcycle nahi mili."
                });
            }


            res.json({
                success: true,
                message:
                    "Motorcycle successfully updated!"
            });

        } catch (error) {

            console.error(
                "Motorcycle update error:",
                error
            );


            res.status(500).json({
                success: false,
                message:
                    "Motorcycle update nahi ho saki.",
                error: error.message
            });
        }

    }
);


app.delete(
    "/api/motorcycles/:id",
    async (req, res) => {

        try {

            const [sales] =
                await db.query(
                    `
                    SELECT COUNT(*) AS total
                    FROM sales
                    WHERE motorcycle_id = ?
                    `,
                    [req.params.id]
                );


            if (Number(sales[0].total) > 0) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Ye motorcycle sale ho chuki hai."
                });
            }


            const [result] =
                await db.query(
                    `
                    DELETE FROM motorcycles
                    WHERE id = ?
                    `,
                    [req.params.id]
                );


            if (!result.affectedRows) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Motorcycle nahi mili."
                });
            }


            res.json({
                success: true,
                message:
                    "Motorcycle successfully deleted!"
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message:
                    "Motorcycle delete nahi ho saki.",
                error: error.message
            });
        }

    }
);


// ======================================================
// SALES
// ======================================================

app.get(
    "/api/sales",
    async (req, res) => {

        try {

            const [sales] =
                await db.query(`
                    SELECT

                        s.id,
                        s.customer_id,
                        s.motorcycle_id,
                        s.sale_date,
                        s.sale_type,
                        s.sale_price,
                        s.total_price,
                        s.advance_payment,
                        s.remaining_balance,
                        s.installment_count,
                        s.installment_amount,
                        s.first_due_date,
                        s.reminder_days,
                        s.sale_status,

                        c.customer_name,
                        c.phone,

                        m.company,
                        m.model,
                        m.color,
                        m.engine_number,
                        m.chassis_number

                    FROM sales s

                    LEFT JOIN customers c
                        ON c.id = s.customer_id

                    LEFT JOIN motorcycles m
                        ON m.id = s.motorcycle_id

                    ORDER BY s.id DESC
                `);


            res.json(sales);

        } catch (error) {

            console.error(
                "Sales load error:",
                error
            );


            res.status(500).json({
                success: false,
                message:
                    "Sales load nahi ho sakin.",
                error: error.message
            });
        }

    }
);


app.get(
    "/api/sales/:id",
    async (req, res) => {

        try {

            const [sales] =
                await db.query(
                    `
                    SELECT

                        s.*,

                        c.customer_name,
                        c.father_name,
                        c.phone,
                        c.cnic,

                        m.company,
                        m.model,
                        m.color,
                        m.engine_number,
                        m.chassis_number

                    FROM sales s

                    LEFT JOIN customers c
                        ON c.id = s.customer_id

                    LEFT JOIN motorcycles m
                        ON m.id = s.motorcycle_id

                    WHERE s.id = ?
                    `,
                    [req.params.id]
                );


            if (!sales.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Sale nahi mili."
                });
            }


            const [installments] =
                await db.query(
                    `
                    SELECT *

                    FROM installments

                    WHERE sale_id = ?

                    ORDER BY installment_number
                    `,
                    [req.params.id]
                );


            res.json({
                success: true,
                sale: sales[0],
                installments
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message:
                    "Sale details load nahi ho sake.",
                error: error.message
            });
        }

    }
);


app.post(
    "/api/sales",
    async (req, res) => {

        const connection =
            await db.getConnection();


        try {

            await connection.beginTransaction();


            const {
                customer_id,
                motorcycle_id,
                sale_date,
                sale_type,
                total_price,
                advance_payment,
                installment_count,
                first_due_date,
                reminder_days
            } = req.body;


            // ------------------------------------------
            // BASIC VALIDATION
            // ------------------------------------------

            if (
                !customer_id ||
                !motorcycle_id ||
                !sale_date
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "Customer, motorcycle aur sale date required hain."
                });
            }


            const total =
                Number(total_price) || 0;


            const advance =
                Number(advance_payment) || 0;


            if (total <= 0) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "Total sale price valid honi chahiye."
                });
            }


            if (
                advance < 0 ||
                advance > total
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "Advance total price se zyada nahi ho sakta."
                });
            }


            const remaining =
                Math.max(
                    0,
                    total - advance
                );


            // ------------------------------------------
            // CUSTOMER CHECK
            // ------------------------------------------

            const [customerRows] =
                await connection.query(
                    `
                    SELECT id
                    FROM customers
                    WHERE id = ?
                    FOR UPDATE
                    `,
                    [customer_id]
                );


            if (!customerRows.length) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "Customer nahi mila."
                });
            }


            // ------------------------------------------
            // MOTORCYCLE CHECK
            // ------------------------------------------

            const [motorcycleRows] =
                await connection.query(
                    `
                    SELECT
                        id,
                        company,
                        model,
                        sale_price,
                        stock_status

                    FROM motorcycles

                    WHERE id = ?

                    FOR UPDATE
                    `,
                    [motorcycle_id]
                );


            if (!motorcycleRows.length) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "Motorcycle nahi mili."
                });
            }


            const motorcycle =
                motorcycleRows[0];


            if (
                motorcycle.stock_status !==
                "In Stock"
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "Ye motorcycle already Sold ya Reserved hai."
                });
            }


            // ------------------------------------------
            // SALE TYPE
            // ------------------------------------------

            const type =
                sale_type ===
                "Installment"
                    ? "Installment"
                    : "Cash";


            let count = null;

            let monthlyAmount = null;

            let firstDue = null;

            let reminder = 3;


            if (
                type ===
                "Installment"
            ) {

                count =
                    Number(installment_count) || 0;


                firstDue =
                    first_due_date || null;


                reminder =
                    Number(reminder_days);


                if (
                    reminder !== 0 &&
                    !reminder
                ) {
                    reminder = 3;
                }


                if (count <= 0) {

                    await connection.rollback();

                    return res.status(400).json({
                        success: false,
                        message:
                            "Installment count required hai."
                    });
                }


                if (!firstDue) {

                    await connection.rollback();

                    return res.status(400).json({
                        success: false,
                        message:
                            "First due date required hai."
                    });
                }


                monthlyAmount =
                    remaining / count;
            }


            // ------------------------------------------
            // INSERT SALE
            // ------------------------------------------

            const [saleResult] =
                await connection.query(
                    `
                    INSERT INTO sales

                    (
                        customer_id,
                        motorcycle_id,
                        sale_date,
                        sale_type,
                        sale_price,
                        total_price,
                        advance_payment,
                        remaining_balance,
                        installment_count,
                        installment_amount,
                        first_due_date,
                        reminder_days,
                        sale_status
                    )

                    VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
                    `,
                    [
                        Number(customer_id),
                        Number(motorcycle_id),
                        sale_date,
                        type,
                        total,
                        total,
                        advance,
                        remaining,
                        count,
                        monthlyAmount,
                        firstDue,
                        reminder
                    ]
                );


            const saleId =
                saleResult.insertId;


            // ------------------------------------------
            // INSTALLMENT SCHEDULE
            // ------------------------------------------

            if (
                type ===
                "Installment"
            ) {

                const schedule =
                    buildInstallmentSchedule(
                        firstDue,
                        count,
                        monthlyAmount
                    );


                for (
                    const item
                    of schedule
                ) {

                    await connection.query(
                        `
                        INSERT INTO installments
                        (
                            sale_id,
                            installment_number,
                            due_date,
                            amount,
                            paid_amount,
                            status
                        )

                        VALUES (?, ?, ?, ?, 0, 'Pending')
                        `,
                        [
                            saleId,
                            item.installment_number,
                            item.due_date,
                            item.amount
                        ]
                    );
                }
            }


            // ------------------------------------------
            // MARK MOTORCYCLE SOLD
            // ------------------------------------------

            await connection.query(
                `
                UPDATE motorcycles

                SET stock_status = 'Sold'

                WHERE id = ?
                `,
                [motorcycle_id]
            );


            await connection.commit();


            res.status(201).json({

                success: true,

                message:
                    "Sale successfully save ho gayi.",

                sale_id:
                    saleId,

                remaining_balance:
                    remaining,

                installment_amount:
                    monthlyAmount

            });


        } catch (error) {

            await connection.rollback();

            console.error(
                "Sale create error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Sale save nahi ho saki.",

                error:
                    error.message

            });

        } finally {

            connection.release();
        }

    }
);



// ======================================================
// INSTALLMENT REMINDER AUTOMATION
// ======================================================

function localTodayISO() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function daysBetween(dateA, dateB) {
    const a = new Date(`${dateA}T00:00:00`);
    const b = new Date(`${dateB}T00:00:00`);
    return Math.round((a.getTime() - b.getTime()) / 86400000);
}

async function fetchReminderRows() {
    const [rows] = await db.query(`
        SELECT
            i.id AS installment_id,
            i.sale_id,
            i.installment_number,
            i.due_date,
            i.amount,
            i.paid_amount,
            i.status,
            COALESCE(s.reminder_days, ?) AS reminder_days,
            s.remaining_balance AS sale_remaining_balance,
            c.customer_name,
            c.phone,
            c.alternate_phone,
            c.cnic,
            m.company,
            m.model,
            m.engine_number
        FROM installments i
        INNER JOIN sales s ON s.id = i.sale_id
        INNER JOIN customers c ON c.id = s.customer_id
        INNER JOIN motorcycles m ON m.id = s.motorcycle_id
        WHERE i.status IN ('Pending','Partial')
        ORDER BY i.due_date ASC, i.installment_number ASC
    `, [DEFAULT_REMINDER_DAYS]);
    return rows;
}

function classifyReminder(row, today) {
    const dueDate = String(row.due_date).slice(0, 10);
    const daysUntilDue = daysBetween(dueDate, today);
    const reminderDays = Math.max(0, Number(row.reminder_days) || DEFAULT_REMINDER_DAYS);

    if (daysUntilDue === reminderDays) {
        return {
            type: 'upcoming',
            title: `Installment due in ${reminderDays} day${reminderDays === 1 ? '' : 's'}`,
            daysUntilDue
        };
    }

    if (daysUntilDue === 0) {
        return { type: 'due_today', title: 'Installment due today', daysUntilDue };
    }

    if (daysUntilDue < 0 && Math.abs(daysUntilDue) === DEFAULT_OVERDUE_ALERT_DAYS) {
        const n = Math.abs(daysUntilDue);
        return {
            type: 'overdue',
            title: `Installment overdue by ${n} day${n === 1 ? '' : 's'}`,
            daysUntilDue
        };
    }

    return null;
}

async function processReminderAutomation() {
    const today = localTodayISO();
    const rows = await fetchReminderRows();
    let processed = 0;

    for (const row of rows) {
        const classification = classifyReminder(row, today);
        if (!classification) continue;

        const outstandingAmount = Math.max(
            0,
            (Number(row.amount) || 0) - (Number(row.paid_amount) || 0)
        );

        const payload = {
            event: 'installment_reminder',
            reminder_type: classification.type,
            title: classification.title,
            reminder_date: today,
            installment_id: row.installment_id,
            sale_id: row.sale_id,
            installment_number: row.installment_number,
            due_date: String(row.due_date).slice(0, 10),
            days_until_due: classification.daysUntilDue,
            installment_amount: Number(row.amount) || 0,
            paid_amount: Number(row.paid_amount) || 0,
            outstanding_amount: outstandingAmount,
            sale_remaining_balance: Number(row.sale_remaining_balance) || 0,
            customer: {
                name: row.customer_name,
                phone: row.phone,
                alternate_phone: row.alternate_phone,
                cnic: row.cnic
            },
            motorcycle: {
                company: row.company,
                model: row.model,
                engine_number: row.engine_number
            }
        };

        const [existing] = await db.query(`
            SELECT id
            FROM reminder_logs
            WHERE installment_id = ?
              AND reminder_type = ?
              AND reminder_date = ?
            LIMIT 1
        `, [row.installment_id, classification.type, today]);

        if (existing.length) continue;

        let deliveredToN8n = false;

        if (N8N_REMINDER_WEBHOOK) {
            try {
                const response = await fetch(N8N_REMINDER_WEBHOOK, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                deliveredToN8n = response.ok;

                if (!response.ok) {
                    const text = await response.text().catch(() => '');
                    console.error('n8n reminder webhook failed:', response.status, text);
                }
            } catch (error) {
                console.error('n8n reminder webhook error:', error.message);
            }
        } else {
            console.log('Reminder ready (configure N8N_REMINDER_WEBHOOK):', JSON.stringify(payload));
            deliveredToN8n = false;
        }

        if (deliveredToN8n) {
            await db.query(`
                INSERT INTO reminder_logs
                (installment_id, reminder_type, reminder_date, payload)
                VALUES (?, ?, ?, ?)
            `, [
                row.installment_id,
                classification.type,
                today,
                JSON.stringify(payload)
            ]);
            processed++;
        }
    }

    if (processed) {
        console.log(`Reminder automation processed ${processed} reminder(s).`);
    }

    return processed;
}

app.get('/api/reminders/check', async (req, res) => {
    try {
        const processed = await processReminderAutomation();
        res.json({ success: true, processed, checked_at: new Date().toISOString() });
    } catch (error) {
        console.error('Reminder check error:', error);
        res.status(500).json({ success: false, message: 'Reminder check nahi ho saka.', error: error.message });
    }
});

app.get('/api/reminders/logs', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT * FROM reminder_logs
            ORDER BY sent_at DESC
            LIMIT 200
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Reminder logs load nahi ho saken.', error: error.message });
    }
});

// ======================================================
// INSTALLMENTS
// ======================================================

app.get(
    "/api/installments",
    async (req, res) => {

        try {

            const [rows] =
                await db.query(`
                    SELECT

                        i.*,

                        s.total_price,
                        s.remaining_balance,

                        c.customer_name,
                        c.phone,

                        m.company,
                        m.model,
                        m.engine_number

                    FROM installments i

                    INNER JOIN sales s
                        ON s.id = i.sale_id

                    INNER JOIN customers c
                        ON c.id = s.customer_id

                    INNER JOIN motorcycles m
                        ON m.id = s.motorcycle_id

                    ORDER BY
                        i.due_date ASC,
                        i.installment_number ASC
                `);


            res.json(rows);

        } catch (error) {

            res.status(500).json({
                success: false,
                message:
                    "Installments load nahi ho sakin.",
                error: error.message
            });
        }

    }
);


app.get(
    "/api/installments/due",
    async (req, res) => {

        try {

            const [rows] =
                await db.query(`
                    SELECT

                        i.*,

                        s.total_price,
                        s.remaining_balance,

                        c.customer_name,
                        c.phone,

                        m.company,
                        m.model,
                        m.engine_number

                    FROM installments i

                    INNER JOIN sales s
                        ON s.id = i.sale_id

                    INNER JOIN customers c
                        ON c.id = s.customer_id

                    INNER JOIN motorcycles m
                        ON m.id = s.motorcycle_id

                    WHERE
                        i.status IN
                        ('Pending', 'Partial')

                        AND i.due_date <= CURDATE()

                    ORDER BY
                        i.due_date ASC
                `);


            res.json(rows);

        } catch (error) {

            res.status(500).json({
                success: false,
                message:
                    "Due installments load nahi ho sakin.",
                error: error.message
            });
        }

    }
);


app.get(
    "/api/installments/overdue",
    async (req, res) => {

        try {

            const [rows] =
                await db.query(`
                    SELECT

                        i.*,

                        s.total_price,
                        s.remaining_balance,

                        c.customer_name,
                        c.phone,

                        m.company,
                        m.model,
                        m.engine_number

                    FROM installments i

                    INNER JOIN sales s
                        ON s.id = i.sale_id

                    INNER JOIN customers c
                        ON c.id = s.customer_id

                    INNER JOIN motorcycles m
                        ON m.id = s.motorcycle_id

                    WHERE
                        i.status IN
                        ('Pending', 'Partial')

                        AND i.due_date < CURDATE()

                    ORDER BY
                        i.due_date ASC
                `);


            res.json(rows);

        } catch (error) {

            res.status(500).json({
                success: false,
                message:
                    "Overdue installments load nahi ho sakin.",
                error: error.message
            });
        }

    }
);


// ======================================================
// INSTALLMENT PAYMENT
// ======================================================

app.post(
    "/api/installment-payments",
    async (req, res) => {

        const connection =
            await db.getConnection();


        try {

            await connection.beginTransaction();


            const {
                installment_id,
                amount,
                payment_date,
                payment_method,
                notes
            } = req.body;


            const paymentAmount =
                Number(amount) || 0;


            if (
                !installment_id ||
                paymentAmount <= 0
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "Installment aur payment amount required hain."
                });
            }


            const [rows] =
                await connection.query(
                    `
                    SELECT *

                    FROM installments

                    WHERE id = ?

                    FOR UPDATE
                    `,
                    [installment_id]
                );


            if (!rows.length) {

                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        "Installment nahi mili."
                });
            }


            const installment =
                rows[0];


            const pendingAmount =
                Number(
                    installment.amount
                ) -
                Number(
                    installment.paid_amount
                );


            if (
                paymentAmount >
                pendingAmount
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        `Payment ${pendingAmount} se zyada nahi ho sakti.`
                });
            }


            const newPaidAmount =
                Number(
                    installment.paid_amount
                ) +
                paymentAmount;


            const fullyPaid =
                newPaidAmount >=
                Number(
                    installment.amount
                );


            const newStatus =
                fullyPaid
                    ? "Paid"
                    : "Partial";


            const paidDate =
                payment_date ||
                new Date()
                    .toISOString()
                    .split("T")[0];


            // PAYMENT HISTORY
            await connection.query(
                `
                INSERT INTO installment_payments
                (
                    sale_id,
                    installment_id,
                    payment_date,
                    amount,
                    payment_method,
                    notes
                )

                VALUES (?, ?, ?, ?, ?, ?)
                `,
                [
                    installment.sale_id,
                    installment.id,
                    paidDate,
                    paymentAmount,
                    payment_method ||
                        "Cash",
                    notes || null
                ]
            );


            // UPDATE INSTALLMENT
            await connection.query(
                `
                UPDATE installments

                SET
                    paid_amount = ?,
                    status = ?,
                    paid_date = ?

                WHERE id = ?
                `,
                [
                    newPaidAmount,
                    newStatus,
                    fullyPaid
                        ? paidDate
                        : null,
                    installment.id
                ]
            );


            // UPDATE SALE BALANCE
            await connection.query(
                `
                UPDATE sales

                SET
                    remaining_balance =
                        GREATEST(
                            0,
                            remaining_balance - ?
                        )

                WHERE id = ?
                `,
                [
                    paymentAmount,
                    installment.sale_id
                ]
            );


            // COMPLETED
            await connection.query(
                `
                UPDATE sales

                SET sale_status = 'Completed'

                WHERE
                    id = ?

                    AND remaining_balance <= 0
                `,
                [installment.sale_id]
            );


            await connection.commit();


            res.status(201).json({

                success: true,

                message:
                    "Installment payment successfully save ho gayi.",

                installment_status:
                    newStatus

            });


        } catch (error) {

            await connection.rollback();

            console.error(
                "Installment payment error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Payment save nahi ho saki.",

                error:
                    error.message

            });

        } finally {

            connection.release();
        }

    }
);


// ======================================================
// PAYMENT HISTORY
// ======================================================

app.get(
    "/api/installment-payments/:saleId",
    async (req, res) => {

        try {

            const [rows] =
                await db.query(
                    `
                    SELECT *

                    FROM installment_payments

                    WHERE sale_id = ?

                    ORDER BY
                        payment_date DESC,
                        id DESC
                    `,
                    [req.params.saleId]
                );


            res.json(rows);

        } catch (error) {

            res.status(500).json({
                success: false,
                message:
                    "Payment history load nahi ho saki.",
                error: error.message
            });
        }

    }
);


// ======================================================
// SUPPLIERS
// ======================================================

app.get('/api/suppliers', async (req, res) => {
    try {
        const search = (req.query.search || '').trim();
        let sql = `
            SELECT
                id, supplier_name, phone, alternate_phone, cnic,
                address, city, company_name, notes, created_at
            FROM suppliers
        `;
        const params = [];

        if (search) {
            sql += `
                WHERE
                    supplier_name LIKE ?
                    OR phone LIKE ?
                    OR cnic LIKE ?
                    OR city LIKE ?
                    OR company_name LIKE ?
            `;
            const like = `%${search}%`;
            params.push(like, like, like, like, like);
        }

        sql += ' ORDER BY id DESC';
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (error) {
        console.error('Suppliers load error:', error);
        res.status(500).json({
            success: false,
            message: 'Suppliers load nahi ho sake.',
            error: error.message
        });
    }
});

app.get('/api/suppliers/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM suppliers WHERE id = ?',
            [req.params.id]
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: 'Supplier nahi mila.'
            });
        }

        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Supplier load nahi ho saka.',
            error: error.message
        });
    }
});

app.post('/api/suppliers', async (req, res) => {
    try {
        const {
            supplier_name, phone, alternate_phone, cnic,
            address, city, company_name, notes
        } = req.body;

        if (!supplier_name || !String(supplier_name).trim()) {
            return res.status(400).json({
                success: false,
                message: 'Supplier name required hai.'
            });
        }

        const [result] = await db.query(
            `
            INSERT INTO suppliers
            (supplier_name, phone, alternate_phone, cnic, address, city, company_name, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                String(supplier_name).trim(),
                phone?.trim() || null,
                alternate_phone?.trim() || null,
                cnic?.trim() || null,
                address?.trim() || null,
                city?.trim() || null,
                company_name?.trim() || null,
                notes?.trim() || null
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Supplier successfully saved!',
            supplier_id: result.insertId
        });
    } catch (error) {
        console.error('Supplier save error:', error);
        res.status(500).json({
            success: false,
            message: 'Supplier save nahi ho saka.',
            error: error.message
        });
    }
});

app.put('/api/suppliers/:id', async (req, res) => {
    try {
        const {
            supplier_name, phone, alternate_phone, cnic,
            address, city, company_name, notes
        } = req.body;

        if (!supplier_name || !String(supplier_name).trim()) {
            return res.status(400).json({
                success: false,
                message: 'Supplier name required hai.'
            });
        }

        const [result] = await db.query(
            `
            UPDATE suppliers SET
                supplier_name = ?,
                phone = ?,
                alternate_phone = ?,
                cnic = ?,
                address = ?,
                city = ?,
                company_name = ?,
                notes = ?
            WHERE id = ?
            `,
            [
                String(supplier_name).trim(),
                phone?.trim() || null,
                alternate_phone?.trim() || null,
                cnic?.trim() || null,
                address?.trim() || null,
                city?.trim() || null,
                company_name?.trim() || null,
                notes?.trim() || null,
                req.params.id
            ]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: 'Supplier nahi mila.'
            });
        }

        res.json({
            success: true,
            message: 'Supplier successfully updated!'
        });
    } catch (error) {
        console.error('Supplier update error:', error);
        res.status(500).json({
            success: false,
            message: 'Supplier update nahi ho saka.',
            error: error.message
        });
    }
});

app.delete('/api/suppliers/:id', async (req, res) => {
    try {
        const [purchaseRows] = await db.query(
            'SELECT COUNT(*) AS total FROM purchases WHERE supplier_id = ?',
            [req.params.id]
        );

        if (Number(purchaseRows[0].total) > 0) {
            return res.status(400).json({
                success: false,
                message: 'Is supplier ki purchases mojood hain, is liye delete nahi ho sakta.'
            });
        }

        const [result] = await db.query(
            'DELETE FROM suppliers WHERE id = ?',
            [req.params.id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: 'Supplier nahi mila.'
            });
        }

        res.json({
            success: true,
            message: 'Supplier successfully deleted!'
        });
    } catch (error) {
        console.error('Supplier delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Supplier delete nahi ho saka.',
            error: error.message
        });
    }
});


// ======================================================
// PURCHASES
// ======================================================

app.get('/api/purchases', async (req, res) => {
    try {
        const search = (req.query.search || '').trim();

        let sql = `
            SELECT
                p.id,
                p.supplier_id,
                p.motorcycle_id,
                p.purchase_date,
                p.purchase_price,
                p.payment_amount,
                p.remaining_balance,
                p.payment_status,
                p.payment_method,
                p.invoice_number,
                p.notes,
                p.created_at,
                s.supplier_name,
                s.phone AS supplier_phone,
                m.company,
                m.model,
                m.engine_number,
                m.chassis_number
            FROM purchases p
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            LEFT JOIN motorcycles m ON m.id = p.motorcycle_id
        `;

        const params = [];

        if (search) {
            sql += `
                WHERE
                    s.supplier_name LIKE ?
                    OR m.company LIKE ?
                    OR m.model LIKE ?
                    OR m.engine_number LIKE ?
                    OR p.invoice_number LIKE ?
                    OR p.payment_status LIKE ?
            `;
            const like = `%${search}%`;
            params.push(like, like, like, like, like, like);
        }

        sql += ' ORDER BY p.id DESC';

        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (error) {
        console.error('Purchases load error:', error);
        res.status(500).json({
            success: false,
            message: 'Purchases load nahi ho sakin.',
            error: error.message
        });
    }
});

app.get('/api/purchases/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT
                p.*,
                s.supplier_name, s.phone AS supplier_phone,
                m.company, m.model, m.engine_number, m.chassis_number
            FROM purchases p
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            LEFT JOIN motorcycles m ON m.id = p.motorcycle_id
            WHERE p.id = ?
            `,
            [req.params.id]
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: 'Purchase nahi mili.'
            });
        }

        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Purchase load nahi ho saki.',
            error: error.message
        });
    }
});

app.post('/api/purchases', async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const {
            supplier_id,
            motorcycle_id,
            purchase_date,
            purchase_price,
            payment_amount,
            payment_method,
            invoice_number,
            notes
        } = req.body;

        if (!purchase_date) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Purchase date required hai.'
            });
        }

        const purchasePrice = Number(purchase_price) || 0;
        const paymentAmount = Number(payment_amount) || 0;

        if (purchasePrice <= 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Purchase price valid honi chahiye.'
            });
        }

        if (paymentAmount < 0 || paymentAmount > purchasePrice) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Payment amount purchase price se zyada nahi ho sakta.'
            });
        }

        const remaining = Math.max(0, purchasePrice - paymentAmount);
        const paymentStatus = remaining <= 0 ? 'Paid' : (paymentAmount > 0 ? 'Partial' : 'Unpaid');

        if (supplier_id) {
            const [supplierRows] = await connection.query(
                'SELECT id FROM suppliers WHERE id = ? FOR UPDATE',
                [supplier_id]
            );
            if (!supplierRows.length) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Supplier nahi mila.'
                });
            }
        }

        if (motorcycle_id) {
            const [motorcycleRows] = await connection.query(
                `
                SELECT id, company, model, stock_status
                FROM motorcycles
                WHERE id = ?
                FOR UPDATE
                `,
                [motorcycle_id]
            );

            if (!motorcycleRows.length) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Motorcycle nahi mili.'
                });
            }
        }

        const [result] = await connection.query(
            `
            INSERT INTO purchases
            (supplier_id, motorcycle_id, purchase_date, purchase_price,
             payment_amount, remaining_balance, payment_status,
             payment_method, invoice_number, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                supplier_id || null,
                motorcycle_id || null,
                purchase_date,
                purchasePrice,
                paymentAmount,
                remaining,
                paymentStatus,
                payment_method || 'Cash',
                invoice_number?.trim() || null,
                notes?.trim() || null
            ]
        );

        if (motorcycle_id) {
            await connection.query(
                `
                UPDATE motorcycles
                SET purchase_price = ?,
                    purchase_date = ?,
                    stock_status = CASE
                        WHEN stock_status = 'Sold' THEN stock_status
                        ELSE 'In Stock'
                    END
                WHERE id = ?
                `,
                [purchasePrice, purchase_date, motorcycle_id]
            );
        }

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Purchase successfully saved!',
            purchase_id: result.insertId,
            remaining_balance: remaining,
            payment_status: paymentStatus
        });
    } catch (error) {
        await connection.rollback();
        console.error('Purchase save error:', error);
        res.status(500).json({
            success: false,
            message: 'Purchase save nahi ho saki.',
            error: error.message
        });
    } finally {
        connection.release();
    }
});

app.put('/api/purchases/:id', async (req, res) => {
    try {
        const {
            supplier_id, motorcycle_id, purchase_date, purchase_price,
            payment_amount, payment_method, invoice_number, notes
        } = req.body;

        const purchasePrice = Number(purchase_price) || 0;
        const paymentAmount = Number(payment_amount) || 0;

        if (!purchase_date || purchasePrice <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Purchase date aur valid purchase price required hain.'
            });
        }

        if (paymentAmount < 0 || paymentAmount > purchasePrice) {
            return res.status(400).json({
                success: false,
                message: 'Payment amount purchase price se zyada nahi ho sakta.'
            });
        }

        const remaining = Math.max(0, purchasePrice - paymentAmount);
        const paymentStatus = remaining <= 0 ? 'Paid' : (paymentAmount > 0 ? 'Partial' : 'Unpaid');

        const [result] = await db.query(
            `
            UPDATE purchases SET
                supplier_id = ?,
                motorcycle_id = ?,
                purchase_date = ?,
                purchase_price = ?,
                payment_amount = ?,
                remaining_balance = ?,
                payment_status = ?,
                payment_method = ?,
                invoice_number = ?,
                notes = ?
            WHERE id = ?
            `,
            [
                supplier_id || null,
                motorcycle_id || null,
                purchase_date,
                purchasePrice,
                paymentAmount,
                remaining,
                paymentStatus,
                payment_method || 'Cash',
                invoice_number?.trim() || null,
                notes?.trim() || null,
                req.params.id
            ]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: 'Purchase nahi mili.'
            });
        }

        if (motorcycle_id) {
            await db.query(
                `
                UPDATE motorcycles
                SET purchase_price = ?, purchase_date = ?
                WHERE id = ?
                `,
                [purchasePrice, purchase_date, motorcycle_id]
            );
        }

        res.json({
            success: true,
            message: 'Purchase successfully updated!',
            remaining_balance: remaining,
            payment_status: paymentStatus
        });
    } catch (error) {
        console.error('Purchase update error:', error);
        res.status(500).json({
            success: false,
            message: 'Purchase update nahi ho saki.',
            error: error.message
        });
    }
});

app.delete('/api/purchases/:id', async (req, res) => {
    try {
        const [result] = await db.query(
            'DELETE FROM purchases WHERE id = ?',
            [req.params.id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: 'Purchase nahi mili.'
            });
        }

        res.json({
            success: true,
            message: 'Purchase successfully deleted!'
        });
    } catch (error) {
        console.error('Purchase delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Purchase delete nahi ho saki.',
            error: error.message
        });
    }
});


// ======================================================
// EXPENSES
// ======================================================

app.get(
    "/api/expenses",
    async (req, res) => {

        try {

            const search =
                (req.query.search || "")
                    .trim();

            let sql = `
                SELECT
                    id,
                    expense_title,
                    category,
                    amount,
                    expense_date,
                    payment_method,
                    description,
                    created_at
                FROM expenses
            `;

            const params = [];

            if (search) {
                sql += `
                    WHERE
                        expense_title LIKE ?
                        OR category LIKE ?
                        OR payment_method LIKE ?
                        OR description LIKE ?
                `;

                const like = `%${search}%`;

                params.push(
                    like,
                    like,
                    like,
                    like
                );
            }

            sql += `
                ORDER BY expense_date DESC, id DESC
            `;

            const [rows] =
                await db.query(
                    sql,
                    params
                );

            res.json(rows);

        } catch (error) {

            console.error(
                "Expenses load error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Expenses load nahi ho sake.",
                error: error.message
            });
        }

    }
);


app.post(
    "/api/expenses",
    async (req, res) => {

        try {

            const {
                expense_title,
                category,
                amount,
                expense_date,
                payment_method,
                description
            } = req.body;

            const expenseAmount =
                Number(amount) || 0;

            if (
                !expense_title ||
                !category ||
                !expense_date ||
                expenseAmount <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Expense title, category, amount aur date required hain."
                });
            }

            const allowedMethods = [
                "Cash",
                "Bank Transfer",
                "JazzCash",
                "EasyPaisa",
                "Other"
            ];

            const method =
                allowedMethods.includes(payment_method)
                    ? payment_method
                    : "Cash";

            const [result] =
                await db.query(
                    `
                    INSERT INTO expenses
                    (
                        expense_title,
                        category,
                        amount,
                        expense_date,
                        payment_method,
                        description
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    `,
                    [
                        expense_title.trim(),
                        category.trim(),
                        expenseAmount,
                        expense_date,
                        method,
                        description?.trim() || null
                    ]
                );

            res.status(201).json({
                success: true,
                message:
                    "Expense successfully saved!",
                expense_id: result.insertId
            });

        } catch (error) {

            console.error(
                "Expense save error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Expense save nahi ho saka.",
                error: error.message
            });
        }

    }
);


app.delete(
    "/api/expenses/:id",
    async (req, res) => {

        try {

            const [result] =
                await db.query(
                    `
                    DELETE FROM expenses
                    WHERE id = ?
                    `,
                    [req.params.id]
                );

            if (!result.affectedRows) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Expense nahi mila."
                });
            }

            res.json({
                success: true,
                message:
                    "Expense successfully deleted!"
            });

        } catch (error) {

            console.error(
                "Expense delete error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Expense delete nahi ho saka.",
                error: error.message
            });
        }

    }
);



// ======================================================
// DASHBOARD
// ======================================================

app.get(
    "/api/dashboard",
    async (req, res) => {

        try {

            const [
                customerResult,
                motorcycleResult,
                stockResult,
                soldResult,
                reservedResult,
                salesResult,
                salesAmountResult,
                outstandingResult,
                purchaseCountResult,
                purchaseAmountResult,
                expenseCountResult,
                expenseAmountResult,
                dueResult,
                overdueResult
            ] = await Promise.all([

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM customers
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM motorcycles
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM motorcycles
                    WHERE stock_status = 'In Stock'
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM motorcycles
                    WHERE stock_status = 'Sold'
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM motorcycles
                    WHERE stock_status = 'Reserved'
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM sales
                `),

                db.query(`
                    SELECT COALESCE(
                        SUM(total_price),
                        0
                    ) AS total
                    FROM sales
                `),

                db.query(`
                    SELECT COALESCE(
                        SUM(remaining_balance),
                        0
                    ) AS total
                    FROM sales
                    WHERE remaining_balance > 0
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM purchases
                `),

                db.query(`
                    SELECT COALESCE(
                        SUM(purchase_price),
                        0
                    ) AS total
                    FROM purchases
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM expenses
                `),

                db.query(`
                    SELECT COALESCE(
                        SUM(amount),
                        0
                    ) AS total
                    FROM expenses
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM installments
                    WHERE
                        status IN
                        ('Pending', 'Partial')
                        AND due_date = CURDATE()
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM installments
                    WHERE
                        status IN
                        ('Pending', 'Partial')
                        AND due_date < CURDATE()
                `)
            ]);


            res.json({

                success: true,

                total_customers:
                    Number(
                        customerResult[0][0].total
                    ),

                total_motorcycles:
                    Number(
                        motorcycleResult[0][0].total
                    ),

                motorcycles_in_stock:
                    Number(
                        stockResult[0][0].total
                    ),

                motorcycles_sold:
                    Number(
                        soldResult[0][0].total
                    ),

                motorcycles_reserved:
                    Number(
                        reservedResult[0][0].total
                    ),

                total_sales:
                    Number(
                        salesResult[0][0].total
                    ),

                total_sales_amount:
                    Number(
                        salesAmountResult[0][0].total
                    ),

                outstanding_balance:
                    Number(
                        outstandingResult[0][0].total
                    ),

                today_due:
                    Number(
                        dueResult[0][0].total
                    ),

                overdue_installments:
                    Number(
                        overdueResult[0][0].total
                    ),

                total_purchases:
                    Number(
                        purchaseCountResult[0][0].total
                    ),

                total_purchase_amount:
                    Number(
                        purchaseAmountResult[0][0].total
                    ),

                total_expenses:
                    Number(
                        expenseCountResult[0][0].total
                    ),

                total_expense_amount:
                    Number(
                        expenseAmountResult[0][0].total
                    )

            });

        } catch (error) {

            console.error(
                "Dashboard error:",
                error
            );


            res.status(500).json({
                success: false,
                message:
                    "Dashboard data load nahi ho saka.",
                error: error.message
            });
        }

    }
);


// ======================================================
// START SERVER
// ======================================================

async function startServer() {

    try {

        await setupDatabase();


        app.listen(
            PORT,
            () => {

                console.log(
                    `Server running at http://localhost:${PORT}`
                );

                console.log(
                    `Reminder automation check every ${Math.round(REMINDER_CHECK_INTERVAL_MS / 60000)} minute(s).`
                );

                setTimeout(() => {
                    processReminderAutomation().catch(error =>
                        console.error('Initial reminder check failed:', error.message)
                    );
                }, 3000);

                setInterval(() => {
                    processReminderAutomation().catch(error =>
                        console.error('Scheduled reminder check failed:', error.message)
                    );
                }, REMINDER_CHECK_INTERVAL_MS);

            }
        );

    } catch (error) {

        console.error(
            "Server start failed:",
            error.message
        );

        process.exit(1);
    }
}


startServer();