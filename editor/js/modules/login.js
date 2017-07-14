var LoginModule = { 
	name: "login",

	server_ready: false,
	session: null,

	preferences: {
		show_guest_warning: true
	},

	init: function()
	{
		var loginarea = document.createElement("div");
		loginarea.id = "login-area";
		loginarea.style.lineHeight = "2em";
		loginarea.style.position = "absolute";
		loginarea.style.top = 0;
		loginarea.style.right = 0;

		this.loginarea = loginarea;
		document.querySelector("#mainmenubar").appendChild( loginarea );

		if(!CORE.server_url)
			console.warn("No server url found in LoginModule");

		LFS.setup( CORE.server_url, function(v){
			if(!v)
			{
				LiteGUI.alert("Cannot connect with server");
				return;
			}

			LoginModule.server_ready = true;
			LoginModule.checkSession();
		});
	},

	checkSession: function()
	{
		this.loginarea.innerHTML = "...";
		var that = this;

		LFS.checkExistingSession( function(session)	{
			that.setSession(session);
		},	function (err) {
			throw err;
		});
	},

	setSession: function(session)
	{
		if(!session || !session.status)
			session = null;

		if(session && this.session && session.user.username === this.session.user.username)
			return;

		this.session = session;
		this.user = session ? session.user : null;
		this.updateLoginArea();
		LiteGUI.trigger( CORE, session ? "user-login" : "user-logout", this.user );
		if( session && session.user && session.user.username == "guest" && this.preferences.show_guest_warning )
			this.showGuestWarning();
	},

	showGuestWarning: function()
	{
		var dialog = LiteGUI.alert("You are connected as <span style='color:white'>GUEST</span> user. Remember that guest users cannot save their work so if you want to save your creations or your resources consider creating a free account.", {title:"Welcome GUEST"});
		dialog.setSize(400,210);
		var info = document.createElement("p");
		info.innerHTML = "Do not show again";
		info.style.color = "#747E94";
		info.style.paddingLeft = "10px";
		dialog.add(info);
		var checkbox = new LiteGUI.Checkbox(false,function(v){
			LoginModule.preferences.show_guest_warning = !v;
		});
		info.appendChild( checkbox.root );
	},

	showGuestAlert: function()
	{
		var dialog = LiteGUI.alert("<p>You are connected as <span style='color:white'>GUEST</span> user. Guest users cannot save their work so if you want to save your creations or your resources consider going to <button class='litebutton'>Create Account</button> (its free).</p>", {title:"We have a problem"});
		dialog.content.querySelector("button").addEventListener("click", function(e){
			dialog.close();
			LoginModule.logout( function(){ 
				LoginModule.showLoginDialog(false,"create");
			});
		});
		dialog.setSize(400,200);
	},

	updateLoginArea: function()
	{
		if (this.user)
		{
			this.loginarea.innerHTML = "logged as <a href=''>"+this.user.username+"</a> <button class='litebutton btn'>Logout</button>";
			this.loginarea.querySelector("a").addEventListener( "click", function(e){ 
				LoginModule.showAccountDialog();
				e.preventDefault();	
				return true;
			});
			this.loginarea.querySelector("button").addEventListener( "click", function() {
				LoginModule.showLogoutDialog();
			});
		}
		else
		{
			this.loginarea.innerHTML = "not logged in <button class='litebutton btn'>Login</button>";
			this.loginarea.querySelector("button").addEventListener("click", function() {
				LoginModule.showLoginDialog();
			});
		}
	},

	showLoginDialog: function( force_login, section )
	{
		if(this.login_dialog)
		{
			this.login_dialog.highlight();
		}
		else
		{
			var title = force_login ? null : "Login";
			this.login_dialog = new LiteGUI.Dialog({ id: "dialog_login", title:title, close: !force_login, width: 400, scroll: false, draggable: !force_login });
			this.login_dialog.root.style.fontSize = "1.4em";

			this.login_dialog.on_close = function()
			{
				LoginModule.login_dialog = null;
			}
			this.login_dialog.show('fade');
			this.login_dialog.widgets = new LiteGUI.Inspector({ name_width: "40%" });
			if(force_login)
				this.login_dialog.makeModal();
		}

		var dialog = this.login_dialog;
		var widgets = dialog.widgets;
		dialog.add(widgets);

		var info = null;
		var username_widget = null;
		var password_widget = null;

		if(section == "create")
			inner_create_account();
		else if(section == "forgot")
			inner_forgot_password();
		else
			inner_show_login();

		function inner_show_login()
		{
			widgets.clear();
			if(force_login)
				widgets.addInfo(null,"You must be logged in, use your account or create a new one",{ className:"dialog-info-warning"} );
			username_widget = widgets.addString("Username", "", {});
			password_widget = widgets.addString("Password", "", { password:true, callback_enter: inner_login });
			widgets.addButton(null, "Login", { callback: function(v){ inner_login(); }});
			widgets.addSeparator();
			widgets.addButton("Forgot password","Reset my password", { callback: inner_forgot_password } );
			widgets.addButton("Don't have account","Create Account", { callback: inner_create_account } );
			widgets.addButton("Just visiting","Login as GUEST", { callback: function(v){ inner_login_guest(); }});
			info = widgets.addInfo( null, "" );
		}

		function inner_login()
		{
			var username = widgets.values["Username"];
			var password = widgets.values["Password"];
			if(!username || !password)
			{
				info.setValue("You must specify username and password");
			}
			else
			{
				LoginModule.login(username,password, inner_result );
				info.setValue("Waiting server...");
			}
		}

		function inner_login_guest()
		{
			LoginModule.login("guest","guest", inner_result );
			info.setValue("Waiting server...");
		}

		function inner_create_account()
		{
			widgets.clear();
			widgets.addTitle( "New account" );
			widgets.addInfo( null, "Fill the profile information" );
			widgets.addTitle( "User profile" );
			var username_widget = widgets.addString("Username", "");
			var email_widget = widgets.addString("Email", "");
			var password_widget = widgets.addString("Password", "", { password:true });
			widgets.addButton(null,"Create Account", { callback: function()	{
				LFS.createAccount( username_widget.getValue(), password_widget.getValue(), email_widget.getValue(), function(v, resp){
					if(v)
					{
						create_info.setValue("Account created!");
						LoginModule.login( username_widget.getValue(), password_widget.getValue() );
						if( LoginModule.login_dialog )
							LoginModule.login_dialog.close();
					}
					else if(resp)
						create_info.setValue("Problem: " + resp.msg);
				}, function(v){
					create_info.setValue("Problem: " + v);
				});
			}});
			var create_info = widgets.addInfo( null, "" );
			widgets.addSeparator();
			widgets.addButton( null, "Back to login", function(){
				inner_show_login();
			});
		}

		function inner_forgot_password()
		{
			widgets.clear();
			widgets.addTitle( "Reset password" );
			var info_widget = widgets.addInfo( null, "Fill your email address" );
			var email_widget = widgets.addString("Email", "");
			var button_widget = widgets.addButton(null,"Request reset password", { callback: function()	{
				LFS.forgotPassword( email_widget.getValue(), function(v){
					info_widget.setValue("A reset password has been send, check your email to get the reset code.");
				});
				info_widget.setValue("Sending request...");
		}}, window.location.href );
			widgets.addSeparator();
			widgets.addButton( null, "Back to login", function(){
				inner_show_login();
			});
		}

		function inner_result(user)
		{
			if(user)
				dialog.close();
			else
				info.setValue("Wrong user/pass");
		}
	},

	showLogoutDialog: function()
	{
		LiteGUI.confirm("Do you want to log out?", inner );
		function inner(v)
		{
			if(v)
				LoginModule.logout();
		}
	},

	showAccountDialog: function()
	{
		if(!this.session)
			return;

		var user = this.session.user;

		var dialog = new LiteGUI.Dialog( {title: "Account", close: true, width: 400, scroll: false, draggable: true });
		dialog.root.style.fontSize = "1.4em";
		dialog.on_close = function()
		{
		}
		dialog.show('fade');
		var widgets = dialog.widgets = new LiteGUI.Inspector( { name_width: "40%" } );
		dialog.add(widgets);

		widgets.addString( "Username", user.username, { disabled: true} );
		widgets.addString( "Email", user.email, { disabled: true} );
		widgets.addButton( null, "Change Password", function(){
			dialog.close();
			LoginModule.showChangePasswordDialog();
		
		});
		widgets.addSeparator();
		widgets.addButton( null, "Close", function(){
			dialog.close();		
		});
	},

	showChangePasswordDialog: function() {
		if(!this.session)
			return;

		var user = this.session.user;

		var dialog = new LiteGUI.Dialog( {title: "Change Password", close: true, width: 400, scroll: false, draggable: true });
		dialog.root.style.fontSize = "1.4em";
		dialog.on_close = function()
		{
		}
		dialog.show('fade');
		var widgets = dialog.widgets = new LiteGUI.Inspector( { name_width: "40%" } );
		dialog.add(widgets);

		var current_pass = "";
		var new_pass = "";

		widgets.addString( "Current Password", "", { password: true, callback: function(v){
			current_pass = v;
		}});


		widgets.addString( "New Password", "", { password: true, callback: function(v){
			new_pass = v;
		}});

		var alert_dialog = null;

		widgets.addSeparator();
		widgets.addButton( null, "Change Password", function(){
			if( !current_pass || !new_pass )
				return;
			dialog.close();
			alert_dialog = LiteGUI.alert("Wait...");
			LoginModule.session.setPassword( current_pass, new_pass, inner_complete	);
		});
		widgets.addButton( null, "Close", function(){
			dialog.close();		
		});

		function inner_complete(v,r)
		{
			if(alert_dialog)
				alert_dialog.close();
			LiteGUI.alert( v ? "Password changed" : "Incorrect password" );
		}
	},

	login: function(username, password, callback)
	{
		if(!username || !password)
			return;

		this.loginarea.innerHTML = "...";

		LFS.login( username, password, inner_success, inner_error);

		function inner_success(session, response)
		{
			LoginModule.setSession(session);
			if(callback)
				callback(LoginModule.user);
		}

		function inner_error(err)
		{
			throw err;
		}
	},

	logout: function(callback) {
		if(this.session)
			this.session.logout( inner_success );
		function inner_success()
		{
			LoginModule.user = null;
			LoginModule.setSession(null);
			if(callback) 
				callback();
		}
	},

	createAccount: function()
	{

	}
};

CORE.registerModule( LoginModule );