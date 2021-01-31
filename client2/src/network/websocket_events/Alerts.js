import PubSub from "pubsub-js";
import ChatWarnings from "../../catalogues/ChatWarnings.json";
import Utils from "../../shared/Utils";
import eventResponses from "./EventResponses";
import { CREATE_ACCOUNT_FAILURE } from "../../shared/EventTypes";
import { ApplicationState } from "../../shared/state/States";

export default () => {
    eventResponses.create_account_success = () => {
        Utils.message("create_account_success");

        ApplicationState.setLoggedIn(true);
    };

    eventResponses.create_account_failure = (data) => {
        Utils.message("create_account_failure:", data);

        if (data) {
            PubSub.publish(CREATE_ACCOUNT_FAILURE, data);
        }
    };

    eventResponses.change_password_success = () => {
        Utils.message("change_password_success");
        const message = Utils.getTextDef("Password changed");
        window.gameScene.GUI.accountPanel.warningText.innerText = message;
        window.gameScene.GUI.accountPanel.warningText.style.backgroundColor = "lime";
        window.gameScene.GUI.accountPanel.warningText.style.visibility = "visible";
    };

    eventResponses.change_password_failure = (data) => {
        Utils.message("change_password_failure:", data);
        if (data) {
            const message = Utils.getTextDef(data.messageID);
            window.gameScene.GUI.accountPanel.warningText.innerText = message;
            window.gameScene.GUI.accountPanel.warningText.style.backgroundColor = "orange";
            window.gameScene.GUI.accountPanel.warningText.style.visibility = "visible";
        }
    };

    eventResponses.chat_warning = (data) => {
        window.gameScene.chat(undefined, Utils.getTextDef(ChatWarnings[data]), "#ffa54f");
    };

    eventResponses.cannot_drop_here = () => {
        window.gameScene.GUI.textCounterSetText(window.gameScene.GUI.inventoryBar.message, Utils.getTextDef("Drop item blocked warning"));
    };

    eventResponses.hatchet_needed = () => {
        window.gameScene.GUI.textCounterSetText(window.gameScene.GUI.inventoryBar.message, Utils.getTextDef("Hatchet needed warning"));
    };

    eventResponses.pickaxe_needed = () => {
        window.gameScene.GUI.textCounterSetText(window.gameScene.GUI.inventoryBar.message, Utils.getTextDef("Pickaxe needed warning"));
    };
};
