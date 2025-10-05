// NAPI-RS wrapper for Node.js/Electron
// This module provides Node.js bindings using NAPI-RS

use napi_derive::napi;

#[napi]
pub fn create_store(name: String) -> Store {
    Store(crate::core::store::Store::new(name))
}

#[napi]
pub struct Store(crate::core::store::Store);

#[napi]
impl Store {
    #[napi(constructor)]
    pub fn new(name: String) -> Self {
        Store(crate::core::store::Store::new(name))
    }

    #[napi]
    pub fn get_name(&self) -> String {
        self.0.get_name()
    }
}
